import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationFailedError } from '../errors/domain-error';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ n: z.coerce.number().int().min(1) }));

  it('coerces and returns valid input', () => {
    expect(pipe.transform({ n: '3' })).toEqual({ n: 3 });
  });

  it('throws a VALIDATION_FAILED domain error with field issues', () => {
    expect(() => pipe.transform({ n: '0' })).toThrow(ValidationFailedError);
    try {
      pipe.transform({ n: 'x' });
    } catch (error) {
      expect((error as ValidationFailedError).issues[0]?.path).toBe('n');
    }
  });
});
