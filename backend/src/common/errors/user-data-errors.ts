import {
  ConflictException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

/** Translate repository signals into the API error contract. */
export function mapUserDataError(error: unknown, what: string): never {
  const message = (error as Error).message;
  if (message === 'LIMIT') throw new UnprocessableEntityException(`${what} limit reached`);
  if (message === 'CONFLICT') throw new ConflictException(`${what} already exists`);
  if (error instanceof HttpException) throw error;
  throw error;
}

export function notFound(what: string): never {
  throw new NotFoundException(`${what} not found`);
}
