import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PRISMA } from '@/infrastructure/database/database.module';
import { type PrismaService } from '@/infrastructure/database/prisma.service';

interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly checks: Record<string, 'ok' | 'fail' | 'disabled'>;
  readonly uptimeSeconds: number;
}

/**
 * Liveness is process-level. Readiness reflects *required* infrastructure
 * only: PostgreSQL when configured. Optional layers (Redis, provider feed)
 * never gate readiness — single-instance fallback is a supported mode.
 */
@ApiExcludeController()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaService | null) {}

  @Get()
  async overview(): Promise<HealthReport> {
    return this.report();
  }

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<HealthReport> {
    const report = await this.report();
    if (report.status !== 'ok') throw new ServiceUnavailableException(report);
    return report;
  }

  private async report(): Promise<HealthReport> {
    const database = this.prisma ? ((await this.prisma.isReady()) ? 'ok' : 'fail') : 'disabled';
    return {
      status: database === 'fail' ? 'degraded' : 'ok',
      checks: { database },
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
