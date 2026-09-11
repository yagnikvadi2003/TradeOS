import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { type Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RealtimeMetrics } from '@/infrastructure/realtime/realtime-metrics';

/**
 * Request-duration histogram and error counters, labelled by method and
 * status class only (bounded cardinality: no paths, no user ids).
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: RealtimeMetrics) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const started = process.hrtime.bigint();
    const record = (status: number) => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      this.metrics.observeHttp(req.method, status, seconds);
      if (status >= 500) this.metrics.inc('httpErrors5xx');
      else if (status >= 400) this.metrics.inc('httpErrors4xx');
    };
    return next.handle().pipe(
      tap({
        next: () => record(res.statusCode),
        error: (error: unknown) => {
          const getStatus = (error as { getStatus?: () => number }).getStatus;
          record(typeof getStatus === 'function' ? getStatus.call(error) : 500);
        },
      }),
    );
  }
}
