import { z } from 'zod';
import {
  INSTRUMENT_KEY_PATTERN,
  OPTION_CONTRACT_KEY_PATTERN,
} from '@/common/market/market-primitives';
import { type ConnectionState } from '@/infrastructure/realtime/connection-state';
import {
  type MarketStatusUpdate,
  type MarketUpdate,
} from '@/modules/market-stream/domain/market-update';

/**
 * `/ws/market` contract (v1). Client → server messages are validated with
 * Zod before anything else happens; server → client messages are TradeOS
 * domain shapes only — never a provider payload.
 */
export const WS_PROTOCOL_VERSION = 1 as const;

/** Shape only; authorization (catalog membership, scope) is decided per key by the service. */
const streamKeySchema = z.string().min(3).max(96);

export function isWellFormedStreamKey(key: string): boolean {
  return INSTRUMENT_KEY_PATTERN.test(key) || OPTION_CONTRACT_KEY_PATTERN.test(key);
}

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().min(16).max(4_096) }),
  z.object({
    type: z.literal('subscribe'),
    instruments: z.array(streamKeySchema).min(1).max(500),
  }),
  z.object({
    type: z.literal('unsubscribe'),
    instruments: z.array(streamKeySchema).min(1).max(500),
  }),
  z.object({ type: z.literal('heartbeat'), sentAt: z.number().int().nonnegative().optional() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type WsErrorCode =
  | 'UNAUTHENTICATED'
  | 'AUTH_FAILED'
  | 'INVALID_MESSAGE'
  | 'NOT_AUTHORIZED'
  | 'RATE_LIMITED'
  | 'SUBSCRIPTION_LIMIT'
  | 'MESSAGE_TOO_LARGE'
  | 'SERVER_BUSY';

export type ServerMessage =
  | {
      readonly type: 'auth';
      readonly ok: true;
      readonly sessionId: string;
      readonly expiresAt: number;
      readonly protocol: typeof WS_PROTOCOL_VERSION;
    }
  | {
      readonly type: 'subscribe';
      readonly ok: true;
      readonly instruments: readonly string[];
      readonly rejected: readonly string[];
    }
  | { readonly type: 'unsubscribe'; readonly ok: true; readonly instruments: readonly string[] }
  /** Current state for keys just subscribed (may be partial: unknown keys have no state yet). */
  | { readonly type: 'snapshot'; readonly updates: readonly MarketUpdate[] }
  /** Coalesced changes since the last flush; at most one entry per key. */
  | { readonly type: 'delta'; readonly updates: readonly MarketUpdate[]; readonly dropped?: number }
  | { readonly type: 'heartbeat'; readonly serverTime: number; readonly sentAt?: number }
  | {
      readonly type: 'connection_status';
      readonly provider: ConnectionState;
      readonly stale: boolean;
      readonly markets?: readonly MarketStatusUpdate[];
    }
  /** Alert trigger for this session (additive in protocol v1; clients may ignore). */
  | {
      readonly type: 'notification';
      readonly id: string;
      readonly alertId: string | null;
      readonly title: string;
      readonly body: string;
      readonly value: number | null;
      readonly createdAt: number;
    }
  | {
      readonly type: 'error';
      readonly code: WsErrorCode;
      readonly message: string;
      readonly fatal?: boolean;
    };

/** Close codes (4xxx are application-defined per RFC 6455). */
export const WS_CLOSE = {
  AUTH_TIMEOUT: 4001,
  AUTH_FAILED: 4003,
  RATE_LIMITED: 4008,
  MESSAGE_TOO_LARGE: 4009,
  SERVER_BUSY: 4013,
  HEARTBEAT_TIMEOUT: 4014,
  SHUTDOWN: 1001,
} as const;
