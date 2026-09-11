import protobuf from 'protobufjs';
import { z } from 'zod';
import { MARKET_DATA_FEED_V3_PROTO } from '../types/proto/market-data-feed-v3.proto';

/**
 * Decoded V3 feed, validated. Only the fields the normalizer reads are
 * declared; everything else is passed through loosely and ignored.
 * Numbers arrive as JS numbers (`longs: Number`), enums as strings.
 */
const num = z.number().finite();
const optNum = num.optional();

const ltpcSchema = z.object({
  ltp: optNum,
  ltt: optNum,
  ltq: optNum,
  cp: optNum,
});

const quoteSchema = z.object({ bidQ: optNum, bidP: optNum, askQ: optNum, askP: optNum });

const greeksSchema = z.object({
  delta: optNum,
  theta: optNum,
  gamma: optNum,
  vega: optNum,
  rho: optNum,
});

const ohlcSchema = z.object({
  interval: z.string().optional(),
  open: optNum,
  high: optNum,
  low: optNum,
  close: optNum,
  vol: optNum,
  ts: optNum,
});

const marketFullFeedSchema = z.object({
  ltpc: ltpcSchema.optional(),
  marketLevel: z.object({ bidAskQuote: z.array(quoteSchema).optional() }).optional(),
  optionGreeks: greeksSchema.optional(),
  marketOHLC: z.object({ ohlc: z.array(ohlcSchema).optional() }).optional(),
  vtt: optNum,
  oi: optNum,
  iv: optNum,
});

const indexFullFeedSchema = z.object({
  ltpc: ltpcSchema.optional(),
  marketOHLC: z.object({ ohlc: z.array(ohlcSchema).optional() }).optional(),
});

const feedSchema = z.object({
  ltpc: ltpcSchema.optional(),
  fullFeed: z
    .object({ marketFF: marketFullFeedSchema.optional(), indexFF: indexFullFeedSchema.optional() })
    .optional(),
  firstLevelWithGreeks: z
    .object({
      ltpc: ltpcSchema.optional(),
      firstDepth: quoteSchema.optional(),
      optionGreeks: greeksSchema.optional(),
      vtt: optNum,
      oi: optNum,
      iv: optNum,
    })
    .optional(),
});

export const feedResponseSchema = z.object({
  type: z.enum(['initial_feed', 'live_feed', 'market_info']).optional(),
  feeds: z.record(z.string(), feedSchema).optional(),
  currentTs: optNum,
  marketInfo: z.object({ segmentStatus: z.record(z.string(), z.string()).optional() }).optional(),
});

export type UpstoxFeedResponse = z.infer<typeof feedResponseSchema>;
export type UpstoxFeed = z.infer<typeof feedSchema>;

export class UpstoxFeedCodec {
  private readonly FeedResponse: protobuf.Type;

  constructor() {
    const root = protobuf.parse(MARKET_DATA_FEED_V3_PROTO, { keepCase: true }).root;
    this.FeedResponse = root.lookupType(
      'com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse',
    );
  }

  /** Throws on undecodable bytes or a shape that fails validation. */
  decode(bytes: Uint8Array): UpstoxFeedResponse {
    const message = this.FeedResponse.decode(bytes);
    const plain: unknown = this.FeedResponse.toObject(message, {
      longs: Number,
      enums: String,
      defaults: false,
    });
    return feedResponseSchema.parse(plain);
  }

  /** Subscription requests are JSON but must be sent as a *binary* frame. */
  static encodeRequest(request: {
    guid: string;
    method: 'sub' | 'unsub' | 'change_mode';
    data: { mode: string; instrumentKeys: string[] };
  }): Buffer {
    return Buffer.from(JSON.stringify(request));
  }
}
