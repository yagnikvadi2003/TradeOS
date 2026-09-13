import { z } from 'zod';

export const watchlistItemSchema = z.object({
  instrumentKey: z.string(),
  position: z.number().int(),
  addedAt: z.number().int(),
});
export const watchlistSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  position: z.number().int(),
  updatedAt: z.number().int(),
  items: z.array(watchlistItemSchema),
});
export const watchlistsResponseSchema = z.object({ data: z.array(watchlistSchema) });
export const watchlistResponseSchema = z.object({ data: watchlistSchema });

export const ALERT_CONDITIONS = [
  'PRICE_ABOVE',
  'PRICE_BELOW',
  'CHANGE_PERCENT_ABOVE',
  'CHANGE_PERCENT_BELOW',
  'VOLUME_ABOVE',
  'OI_CHANGE_ABOVE',
  'IV_ABOVE',
  'IV_BELOW',
  'PCR_ABOVE',
  'PCR_BELOW',
] as const;
export const alertSchema = z.object({
  id: z.string().uuid(),
  instrumentKey: z.string(),
  condition: z.enum(ALERT_CONDITIONS),
  threshold: z.number(),
  status: z.enum(['ACTIVE', 'TRIGGERED', 'DISABLED']),
  repeat: z.boolean(),
  note: z.string().nullable(),
  triggeredAt: z.number().nullable(),
  createdAt: z.number(),
});
export const alertsResponseSchema = z.object({ data: z.array(alertSchema) });
export const alertResponseSchema = z.object({ data: alertSchema });

export const notificationSchema = z.object({
  id: z.string().uuid(),
  alertId: z.string().uuid().nullable(),
  title: z.string(),
  body: z.string(),
  value: z.number().nullable(),
  readAt: z.number().nullable(),
  createdAt: z.number(),
});
export const notificationsResponseSchema = z.object({ data: z.array(notificationSchema) });

export const preferencesSchema = z
  .object({
    theme: z.enum(['dark', 'light', 'system']),
    density: z.enum(['compact', 'comfortable']),
    optionChain: z.object({
      strikeWindow: z.union([z.literal(10), z.literal(20), z.literal(30), z.null()]),
      columnPreset: z.enum(['core', 'extended', 'greeks']),
    }),
    chart: z.object({
      interval: z.enum(['1m', '5m', '15m', '1h', '1d']),
      indicators: z.array(z.string()),
    }),
    notifications: z.object({ browser: z.boolean(), sound: z.boolean() }),
  })
  .partial();
export const preferencesResponseSchema = z.object({ data: preferencesSchema });

export const sessionResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    createdAt: z.number().int(),
    expiresAt: z.number().int(),
  }),
});
export const deletedResponseSchema = z.object({ data: z.object({ deleted: z.literal(true) }) });
export const markedResponseSchema = z.object({ data: z.object({ marked: z.number().int() }) });

export type Watchlist = z.infer<typeof watchlistSchema>;
export type Alert = z.infer<typeof alertSchema>;
export type AlertCondition = (typeof ALERT_CONDITIONS)[number];
export type AppNotification = z.infer<typeof notificationSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export interface CreateAlertInput {
  readonly instrumentKey: string;
  readonly condition: AlertCondition;
  readonly threshold: number;
  readonly repeat?: boolean;
  readonly note?: string;
}
