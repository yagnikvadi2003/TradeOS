/**
 * Application error vocabulary. Domain code throws these; the HTTP layer maps
 * them to status codes and a stable `{ error: { code, message } }` body so
 * clients never see stack traces or provider-specific detail.
 */
export type DomainErrorCode =
  | 'VALIDATION_FAILED'
  | 'INSTRUMENT_NOT_FOUND'
  | 'OPTION_CHAIN_NOT_SUPPORTED'
  | 'EXPIRY_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_PAYLOAD_INVALID'
  | 'INTERNAL';

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class ValidationFailedError extends DomainError {
  constructor(
    message: string,
    readonly issues: readonly { path: string; message: string }[],
  ) {
    super('VALIDATION_FAILED', message, { issues });
    this.name = 'ValidationFailedError';
  }
}

export class InstrumentNotFoundError extends DomainError {
  constructor(instrumentKey: string) {
    super('INSTRUMENT_NOT_FOUND', `Unknown instrument: ${instrumentKey}`, { instrumentKey });
    this.name = 'InstrumentNotFoundError';
  }
}

export class OptionChainNotSupportedError extends DomainError {
  constructor(instrumentKey: string) {
    super('OPTION_CHAIN_NOT_SUPPORTED', `Instrument has no option chain: ${instrumentKey}`, {
      instrumentKey,
    });
    this.name = 'OptionChainNotSupportedError';
  }
}

export class ExpiryNotFoundError extends DomainError {
  constructor(instrumentKey: string, expiryDate: string) {
    super('EXPIRY_NOT_FOUND', `No listed expiry ${expiryDate} for ${instrumentKey}`, {
      instrumentKey,
      expiryDate,
    });
    this.name = 'ExpiryNotFoundError';
  }
}

export class ProviderUnavailableError extends DomainError {
  constructor(provider: string, cause?: unknown) {
    super('PROVIDER_UNAVAILABLE', `Market data provider unavailable (${provider})`, { provider });
    this.name = 'ProviderUnavailableError';
    this.cause = cause;
  }
}

export class ProviderPayloadInvalidError extends DomainError {
  constructor(provider: string, detail: string) {
    super('PROVIDER_PAYLOAD_INVALID', `Provider payload rejected (${provider}): ${detail}`, {
      provider,
    });
    this.name = 'ProviderPayloadInvalidError';
  }
}

export const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, number> = {
  VALIDATION_FAILED: 400,
  INSTRUMENT_NOT_FOUND: 404,
  OPTION_CHAIN_NOT_SUPPORTED: 404,
  EXPIRY_NOT_FOUND: 404,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_PAYLOAD_INVALID: 502,
  INTERNAL: 500,
};
