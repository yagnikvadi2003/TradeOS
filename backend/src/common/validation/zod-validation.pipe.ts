import { Injectable, type PipeTransform } from '@nestjs/common';
import { type ZodType } from 'zod';
import { ValidationFailedError } from '../errors/domain-error';

/**
 * Validates and coerces request inputs (params, query, body) with a Zod
 * schema. Failures surface as 400 `VALIDATION_FAILED` with per-field issues.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new ValidationFailedError(
      'Request validation failed',
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }
}
