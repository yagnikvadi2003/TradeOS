import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiErrorSchema, toOpenApiSchema } from './zod-openapi';

describe('zod → openapi', () => {
  it('projects objects, enums, nullables and descriptions', () => {
    const schema = toOpenApiSchema(
      z.object({
        key: z.string().describe('TradeOS key'),
        kind: z.enum(['index', 'option']),
        ltp: z.number().nullable(),
        list: z.array(z.string()).max(6),
      }),
      { key: 'NSE:INDEX:NIFTY50', kind: 'index', ltp: 24_000, list: [] },
    ) as Record<string, unknown>;
    expect(schema.type).toBe('object');
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.key?.description).toBe('TradeOS key');
    expect(props.kind?.enum).toEqual(['index', 'option']);
    expect(props.ltp?.nullable).toBe(true);
    expect(schema.required).toEqual(['key', 'kind', 'ltp', 'list']);
    expect(schema.example).toMatchObject({ key: 'NSE:INDEX:NIFTY50' });
    expect(schema.$schema).toBeUndefined();
  });

  it('describes the shared error envelope', () => {
    const schema = toOpenApiSchema(apiErrorSchema) as {
      properties: { error: { required: string[] } };
    };
    expect(schema.properties.error.required).toEqual(['code', 'message']);
  });
});
