import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import { type Response } from 'express';
import { Logger } from 'nestjs-pino';
import { DOMAIN_ERROR_STATUS, DomainError } from './domain-error';

export interface ErrorResponseBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
}

/**
 * Single error contract for the REST API. Domain errors carry their own
 * code; Nest HTTP exceptions are normalized; anything else is a 500 with the
 * detail kept in the logs only.
 */
@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.normalize(exception);
    if (status >= 500) {
      this.logger.error({ err: exception, status }, 'unhandled request error');
    }
    response.status(status).json(body);
  }

  private normalize(exception: unknown): { status: number; body: ErrorResponseBody } {
    if (exception instanceof DomainError) {
      const status = DOMAIN_ERROR_STATUS[exception.code];
      return {
        status,
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.details ? { details: exception.details } : {}),
          },
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      return {
        status,
        body: {
          error: {
            code: status === 429 ? 'RATE_LIMITED' : status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
            message: Array.isArray(message) ? message.join('; ') : message,
          },
        },
      };
    }
    return {
      status: 500,
      body: { error: { code: 'INTERNAL', message: 'Internal server error' } },
    };
  }
}
