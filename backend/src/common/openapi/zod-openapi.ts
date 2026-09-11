import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse, type ApiResponseOptions } from '@nestjs/swagger';
import { type SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z, type ZodObject, type ZodType } from 'zod';

/**
 * Zod is the single source of truth for every request and response shape.
 * These helpers project Zod schemas into OpenAPI (Zod 4's native JSON Schema
 * export, no extra dependency) so Swagger can never drift from validation.
 */
export function toOpenApiSchema(schema: ZodType, example?: unknown): SchemaObject {
  const json = z.toJSONSchema(schema, { target: 'openapi-3.0', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  const out = json as SchemaObject;
  if (example !== undefined) out.example = example;
  return out;
}

export interface ZodResponseOptions extends Omit<ApiResponseOptions, 'schema' | 'type'> {
  readonly status: number;
  readonly description: string;
  readonly schema: ZodType;
  readonly example?: unknown;
}

export function ApiZodResponse(options: ZodResponseOptions): MethodDecorator & ClassDecorator {
  const { schema, example, ...rest } = options;
  return ApiResponse({ ...rest, schema: toOpenApiSchema(schema, example) });
}

/** One `@ApiQuery` per top-level key of a Zod object (query strings are flat). */
export function ApiZodQuery(schema: ZodObject, descriptions: Record<string, string> = {}) {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    unrepresentable: 'any',
    io: 'input',
  }) as {
    properties?: Record<string, SchemaObject>;
    required?: string[];
  };
  const decorators = Object.entries(json.properties ?? {}).map(([name, property]) =>
    ApiQuery({
      name,
      required: json.required?.includes(name) ?? false,
      schema: property,
      ...(descriptions[name] ? { description: descriptions[name] } : {}),
    }),
  );
  return applyDecorators(...decorators);
}

export function ApiZodBody(schema: ZodType, description?: string) {
  return ApiBody({ schema: toOpenApiSchema(schema), ...(description ? { description } : {}) });
}

/** The single API error envelope, reused by every endpoint's error responses. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().describe('Stable machine-readable code, e.g. VALIDATION_FAILED'),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export function ApiStandardErrors(...statuses: (400 | 401 | 403 | 404 | 429 | 502 | 503)[]) {
  const text: Record<number, string> = {
    400: 'Validation failed (`VALIDATION_FAILED`, per-field issues in `details.issues`)',
    401: 'Missing or invalid credentials',
    403: 'Forbidden',
    404: 'Unknown instrument, expiry or resource',
    429: 'Rate limited (`RATE_LIMITED`)',
    502: 'Provider payload rejected (`PROVIDER_PAYLOAD_INVALID`)',
    503: 'Provider unavailable (`PROVIDER_UNAVAILABLE`)',
  };
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: text[status] ?? 'Error',
        schema: toOpenApiSchema(apiErrorSchema),
      }),
    ),
  );
}
