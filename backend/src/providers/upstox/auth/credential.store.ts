import { type PrismaService } from '@/infrastructure/database/prisma.service';
import { type CredentialCipher, type EncryptedSecret } from './credential-cipher';

export interface StoredCredential {
  readonly provider: string;
  readonly accessToken: string;
  readonly expiresAt: number | null;
  readonly updatedAt: number;
}

/**
 * Persistence port for provider access tokens. Tokens are encrypted before
 * they reach the store and decrypted only in this process.
 */
export interface ProviderCredentialStore {
  get(provider: string): Promise<StoredCredential | null>;
  set(provider: string, accessToken: string, expiresAt: number | null): Promise<void>;
  clear(provider: string): Promise<void>;
}

export const PROVIDER_CREDENTIAL_STORE = Symbol('PROVIDER_CREDENTIAL_STORE');

/** Development / single-process store: lost on restart, never on disk. */
export class InMemoryCredentialStore implements ProviderCredentialStore {
  private readonly entries = new Map<string, StoredCredential>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  async get(provider: string): Promise<StoredCredential | null> {
    return this.entries.get(provider) ?? null;
  }

  async set(provider: string, accessToken: string, expiresAt: number | null): Promise<void> {
    this.entries.set(provider, { provider, accessToken, expiresAt, updatedAt: this.now() });
  }

  async clear(provider: string): Promise<void> {
    this.entries.delete(provider);
  }
}

/** PostgreSQL store; rows hold AES-256-GCM ciphertext only. */
export class PrismaCredentialStore implements ProviderCredentialStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: CredentialCipher,
  ) {}

  async get(provider: string): Promise<StoredCredential | null> {
    const row = await this.prisma.providerCredential.findUnique({ where: { provider } });
    if (!row) return null;
    const secret: EncryptedSecret = { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag };
    return {
      provider,
      accessToken: this.cipher.decrypt(secret),
      expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
      updatedAt: row.updatedAt.getTime(),
    };
  }

  async set(provider: string, accessToken: string, expiresAt: number | null): Promise<void> {
    const secret = this.cipher.encrypt(accessToken);
    const expires = expiresAt === null ? null : new Date(expiresAt);
    await this.prisma.providerCredential.upsert({
      where: { provider },
      create: { provider, ...secret, expiresAt: expires },
      update: { ...secret, expiresAt: expires },
    });
  }

  async clear(provider: string): Promise<void> {
    await this.prisma.providerCredential.deleteMany({ where: { provider } });
  }
}
