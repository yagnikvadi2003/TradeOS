/**
 * Black–Scholes for European index options. Used only by the mock adapter to
 * produce internally consistent prices, IV and Greeks. Real providers supply
 * their own Greeks; the domain never prices contracts itself.
 */
export interface BsInput {
  readonly spot: number;
  readonly strike: number;
  /** Years to expiry (> 0). */
  readonly t: number;
  /** Annualized volatility as a fraction (0.14 for 14 %). */
  readonly sigma: number;
  /** Continuously compounded risk-free rate. */
  readonly r: number;
}

export interface BsOutput {
  readonly price: number;
  readonly delta: number;
  readonly gamma: number;
  readonly theta: number;
  readonly vega: number;
  readonly rho: number;
}

const SQRT_2PI = Math.sqrt(2 * Math.PI);

function pdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/** Abramowitz–Stegun 26.2.17 normal CDF; error < 7.5e-8, ample for mock data. */
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * ax);
  const poly =
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = pdf(ax) * poly;
  return 0.5 + sign * (0.5 - tail);
}

export function blackScholes(input: BsInput, type: 'CE' | 'PE'): BsOutput {
  const { spot, strike, t, sigma, r } = input;
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-r * t);
  const nd1 = pdf(d1);
  const gamma = nd1 / (spot * sigma * sqrtT);
  const vega = (spot * nd1 * sqrtT) / 100; // per 1 vol-point
  if (type === 'CE') {
    const price = spot * normalCdf(d1) - strike * disc * normalCdf(d2);
    const theta = (-(spot * nd1 * sigma) / (2 * sqrtT) - r * strike * disc * normalCdf(d2)) / 365;
    return {
      price,
      delta: normalCdf(d1),
      gamma,
      theta,
      vega,
      rho: (strike * t * disc * normalCdf(d2)) / 100,
    };
  }
  const price = strike * disc * normalCdf(-d2) - spot * normalCdf(-d1);
  const theta = (-(spot * nd1 * sigma) / (2 * sqrtT) + r * strike * disc * normalCdf(-d2)) / 365;
  return {
    price,
    delta: normalCdf(d1) - 1,
    gamma,
    theta,
    vega,
    rho: (-strike * t * disc * normalCdf(-d2)) / 100,
  };
}
