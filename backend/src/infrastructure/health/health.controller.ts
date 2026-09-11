import {
  Controller,
  Get,
  Header,
  Inject,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { ApiZodResponse } from '@/common/openapi/zod-openapi';
import { PRISMA } from '@/infrastructure/database/database.module';
import { type PrismaService } from '@/infrastructure/database/prisma.service';
import { RealtimeMetrics } from '@/infrastructure/realtime/realtime-metrics';

type CheckState = 'ok' | 'degraded' | 'fail' | 'disabled';

export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly checks: {
    readonly database: CheckState;
    readonly redis: CheckState;
    /** Upstream market-data provider feed. */
    readonly provider: CheckState;
    /** Application WebSocket endpoint. */
    readonly websocket: CheckState;
  };
  readonly uptimeSeconds: number;
  readonly version: string;
}

const checkState = z.enum(['ok', 'degraded', 'fail', 'disabled']);
export const healthReportSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: checkState,
    redis: checkState,
    provider: checkState,
    websocket: checkState,
  }),
  uptimeSeconds: z.number().int(),
  version: z.string(),
});

/**
 * Liveness is process-level. Readiness reflects *required* infrastructure
 * only (PostgreSQL when configured): optional layers — Redis, the provider
 * feed — degrade, they never gate readiness, because single-instance and
 * out-of-session operation are supported modes. The overview reports every
 * dependency as a coarse state; operational detail lives in `/metrics`, not
 * in a public health body.
 */
@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService | null,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly metrics: RealtimeMetrics,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Dependency overview (database, redis, provider, websocket)' })
  @ApiZodResponse({
    status: 200,
    description: 'Coarse state per dependency',
    schema: healthReportSchema,
  })
  async overview(): Promise<HealthReport> {
    return this.report();
  }

  @Get('live')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Liveness: the process is up' })
  @ApiZodResponse({
    status: 200,
    description: 'Alive',
    schema: z.object({ status: z.literal('ok') }),
  })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Readiness: required infrastructure reachable (503 otherwise)' })
  @ApiZodResponse({ status: 200, description: 'Ready', schema: healthReportSchema })
  @ApiZodResponse({
    status: 503,
    description: 'Not ready (required dependency failing)',
    schema: healthReportSchema,
  })
  async ready(): Promise<HealthReport> {
    const report = await this.report();
    if (report.checks.database === 'fail') throw new ServiceUnavailableException(report);
    return report;
  }

  private async report(): Promise<HealthReport> {
    const database: CheckState = this.prisma
      ? (await this.prisma.isReady())
        ? 'ok'
        : 'fail'
      : 'disabled';
    const s = this.metrics.snapshot();
    const redis: CheckState =
      s.redisAvailable === null ? 'disabled' : s.redisAvailable ? 'ok' : 'fail';
    const provider: CheckState =
      s.providerState === 'CONNECTED'
        ? 'ok'
        : s.providerState === 'DEGRADED' ||
            s.providerState === 'RECONNECTING' ||
            s.providerState === 'CONNECTING' ||
            s.providerState === 'AUTHENTICATING'
          ? 'degraded'
          : 'fail';
    const websocket: CheckState = this.metrics.gauge('wsAttached') === true ? 'ok' : 'fail';
    const degraded =
      database === 'fail' || redis === 'fail' || provider !== 'ok' || websocket !== 'ok';
    return {
      status: degraded ? 'degraded' : 'ok',
      checks: { database, redis, provider, websocket },
      uptimeSeconds: Math.round(process.uptime()),
      version: this.env.APP_VERSION,
    };
  }
}
