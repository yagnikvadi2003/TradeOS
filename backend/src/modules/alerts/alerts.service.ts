import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { RealtimeMetrics } from '@/infrastructure/realtime/realtime-metrics';
import { MarketStreamGateway } from '@/modules/market-stream/market-stream.gateway';
import { MarketStreamService } from '@/modules/market-stream/market-stream.service';
import { OptionChainService } from '@/modules/option-chain/option-chain.service';
import { type InstrumentKey, parseOptionContractKey } from '@/common/market/market-primitives';
import {
  type Alert,
  type Notification,
  USER_DATA_REPOSITORY,
  type UserDataRepository,
} from '@/modules/user-data/user-data.types';
import { AlertIndex, conditionMet, evaluate } from './alert-engine';

const ENGINE_CLIENT_ID = 'alert-engine';
const PCR_INTERVAL_MS = 60_000;

/**
 * Alert engine:  market update → index lookup → condition → notification.
 *
 * The engine is a pseudo-client of the market stream: it retains a
 * subscription for every instrument that has an active alert (reference
 * counted with browsers, so an alert on NIFTY 50 costs nothing extra while
 * someone is watching it) and releases it when the last alert goes. PCR
 * alerts read the assembled chain once a minute per underlying (live state
 * first, so no provider call when the feed is warm).
 */
@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly index = new AlertIndex();
  private readonly pcrAlerts = new Map<string, Alert>(); // alertId → alert (PCR conditions)
  private readonly listeners = new Set<(sessionId: string, n: Notification) => void>();
  private off: (() => void) | null = null;
  private pcrTimer: NodeJS.Timeout | null = null;
  private evaluating = false;

  constructor(
    @Inject(USER_DATA_REPOSITORY) private readonly repo: UserDataRepository,
    private readonly stream: MarketStreamService,
    private readonly gateway: MarketStreamGateway,
    private readonly optionChain: OptionChainService,
    private readonly metrics: RealtimeMetrics,
    private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const alert of await this.repo.listActiveAlerts()) this.track(alert);
    this.off = this.stream.onUpdates((updates) => void this.onUpdates(updates));
    this.pcrTimer = setInterval(() => void this.evaluatePcr(), PCR_INTERVAL_MS);
    this.pcrTimer.unref();
    this.metrics.set('activeAlerts', this.index.size + this.pcrAlerts.size);
  }

  onModuleDestroy(): void {
    this.off?.();
    if (this.pcrTimer) clearInterval(this.pcrTimer);
    this.stream.removeClient(ENGINE_CLIENT_ID);
  }

  onNotification(listener: (sessionId: string, n: Notification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Register a live alert; retains the stream key when it is the first alert on it. */
  track(alert: Alert): void {
    if (alert.status !== 'ACTIVE') return;
    if (alert.condition === 'PCR_ABOVE' || alert.condition === 'PCR_BELOW') {
      this.pcrAlerts.set(alert.id, alert);
    } else if (this.index.add(alert)) {
      this.stream.subscribe(ENGINE_CLIENT_ID, [alert.instrumentKey], ['*']);
    }
    this.metrics.set('activeAlerts', this.index.size + this.pcrAlerts.size);
  }

  untrack(alert: Pick<Alert, 'id' | 'instrumentKey' | 'condition'>): void {
    if (alert.condition === 'PCR_ABOVE' || alert.condition === 'PCR_BELOW') {
      this.pcrAlerts.delete(alert.id);
    } else if (this.index.remove(alert)) {
      this.stream.unsubscribe(ENGINE_CLIENT_ID, [alert.instrumentKey]);
    }
    this.metrics.set('activeAlerts', this.index.size + this.pcrAlerts.size);
  }

  private async onUpdates(updates: readonly unknown[]): Promise<void> {
    const hits = evaluate(this.index, updates as never);
    for (const { alert, value } of hits) await this.fire(alert, value);
  }

  private async evaluatePcr(): Promise<void> {
    if (this.evaluating || this.pcrAlerts.size === 0) return;
    this.evaluating = true;
    try {
      const byUnderlying = new Map<string, Alert[]>();
      for (const a of this.pcrAlerts.values()) {
        const key = a.instrumentKey.includes(':OPT:')
          ? underlyingOf(a.instrumentKey)
          : a.instrumentKey;
        if (!key) continue;
        byUnderlying.set(key, [...(byUnderlying.get(key) ?? []), a]);
      }
      for (const [key, alerts] of byUnderlying) {
        try {
          const snapshot = await this.optionChain.getSnapshot(key as InstrumentKey);
          const pcr = snapshot.analytics.oiPcr;
          if (pcr === null) continue;
          for (const a of alerts)
            if (conditionMet(a.condition, pcr, a.threshold)) await this.fire(a, pcr);
        } catch (error) {
          this.logger.warn(
            { err: (error as Error).message, key },
            'alerts: PCR evaluation skipped',
          );
        }
      }
    } finally {
      this.evaluating = false;
    }
  }

  private async fire(alert: Alert, value: number): Promise<void> {
    // Fire once: untrack first so a burst cannot re-trigger before persistence completes.
    this.untrack(alert);
    const now = Date.now();
    await this.repo.markTriggered(alert.id, now, alert.repeat);
    const n = await this.repo.createNotification(alert.sessionId, {
      alertId: alert.id,
      title: `${alert.instrumentKey} ${alert.condition.replaceAll('_', ' ').toLowerCase()} ${alert.threshold}`,
      body:
        alert.note ??
        `Observed ${value} at ${new Date(now).toISOString()} (TradeOS-derived evaluation)`,
      value,
    });
    this.metrics.inc('alertsTriggered');
    for (const l of this.listeners) l(alert.sessionId, n);
    this.gateway.sendToSubject(`session:${alert.sessionId}`, {
      type: 'notification',
      id: n.id,
      alertId: n.alertId,
      title: n.title,
      body: n.body,
      value: n.value,
      createdAt: n.createdAt,
    });
    // Re-armed alerts stay live but only after this evaluation cycle, avoiding tight loops.
    if (alert.repeat)
      setTimeout(
        () => this.track({ ...alert, status: 'ACTIVE', triggeredAt: now }),
        PCR_INTERVAL_MS,
      ).unref();
  }
}

function underlyingOf(contractKey: string): string | null {
  const parsed = parseOptionContractKey(contractKey);
  return parsed ? `${parsed.exchangeCode}:INDEX:${parsed.underlyingSymbol}` : null;
}
