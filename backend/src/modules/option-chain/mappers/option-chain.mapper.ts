import {
  type Expiry,
  type OptionChainMetadata,
  type OptionChainSnapshot,
  type OptionLeg,
} from '../domain';
import {
  type ExpiryDto,
  type OptionChainMetadataDto,
  type OptionChainSnapshotDto,
  type OptionLegDto,
  type ResponseMeta,
} from '../dto/option-chain.response';

/**
 * Domain → v1 DTO. The two shapes are close today, but the mapping is
 * explicit so the domain can change without silently changing the wire
 * contract (and vice versa).
 */
export function toExpiryDto(expiry: Expiry): ExpiryDto {
  return {
    instrumentKey: expiry.instrumentKey,
    expiryDate: expiry.expiryDate,
    cycle: expiry.cycle,
    daysToExpiry: expiry.daysToExpiry,
  };
}

export function toOptionLegDto(leg: OptionLeg): OptionLegDto {
  const { contract, market, value } = leg;
  return {
    contract: {
      contractKey: contract.contractKey,
      underlyingKey: contract.underlyingKey,
      exchangeCode: contract.exchangeCode,
      tradingSymbol: contract.tradingSymbol,
      expiryDate: contract.expiryDate,
      strike: contract.strike,
      optionType: contract.optionType,
      lotSize: contract.lotSize,
      tickSize: contract.tickSize,
    },
    market: {
      ltp: market.ltp,
      previousClose: market.previousClose,
      change: market.change,
      changePercent: market.changePercent,
      volume: market.volume,
      openInterest: market.openInterest,
      openInterestChange: market.openInterestChange,
      impliedVolatility: market.impliedVolatility,
      bid: market.bid,
      ask: market.ask,
      bidQuantity: market.bidQuantity,
      askQuantity: market.askQuantity,
      greeks: market.greeks
        ? {
            delta: market.greeks.delta,
            gamma: market.greeks.gamma,
            theta: market.greeks.theta,
            vega: market.greeks.vega,
            ...(market.greeks.rho !== undefined ? { rho: market.greeks.rho } : {}),
          }
        : null,
      intrinsic: value.intrinsic,
      extrinsic: value.extrinsic,
      spread: value.spread,
      updatedAt: market.updatedAt,
    },
  };
}

export function toSnapshotDto(snapshot: OptionChainSnapshot): OptionChainSnapshotDto {
  return {
    instrumentKey: snapshot.instrumentKey,
    expiry: toExpiryDto(snapshot.expiry),
    underlying: { ...snapshot.underlying },
    atmStrike: snapshot.atmStrike,
    strikeStep: snapshot.strikeStep,
    lotSize: snapshot.lotSize,
    strikes: snapshot.strikes.map((s) => ({
      strike: s.strike,
      isAtm: s.isAtm,
      stepsFromAtm: s.stepsFromAtm,
      ce: s.ce ? toOptionLegDto(s.ce) : null,
      pe: s.pe ? toOptionLegDto(s.pe) : null,
    })),
    totals: { ...snapshot.totals },
    analytics: {
      ...snapshot.analytics,
      oiConcentration: {
        ce: [...snapshot.analytics.oiConcentration.ce],
        pe: [...snapshot.analytics.oiConcentration.pe],
      },
      oiChangeConcentration: {
        ce: [...snapshot.analytics.oiChangeConcentration.ce],
        pe: [...snapshot.analytics.oiChangeConcentration.pe],
      },
      volumeConcentration: {
        ce: [...snapshot.analytics.volumeConcentration.ce],
        pe: [...snapshot.analytics.volumeConcentration.pe],
      },
      supportCandidates: [...snapshot.analytics.supportCandidates],
      resistanceCandidates: [...snapshot.analytics.resistanceCandidates],
    },
    asOf: snapshot.asOf,
    oldestUpdateAt: snapshot.oldestUpdateAt,
    source: snapshot.source,
  };
}

export function toMetadataDto(metadata: OptionChainMetadata): OptionChainMetadataDto {
  return {
    instrumentKey: metadata.instrumentKey,
    symbol: metadata.symbol,
    name: metadata.name,
    strikeStep: metadata.strikeStep,
    lotSize: metadata.lotSize,
    expiries: metadata.expiries.map(toExpiryDto),
    nearestExpiry: metadata.nearestExpiry,
  };
}

export function responseMeta(now: number): ResponseMeta {
  return { version: 'v1', generatedAt: now };
}
