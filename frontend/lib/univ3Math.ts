/// Tick/price math for the Uniswap V3-style pools this DEX runs. Ticks and sqrtPriceX96 values are
/// computed with floating point rather than the exact on-chain fixed-point algorithms - precise enough
/// for UI display and for choosing "desired" amounts, since the contracts themselves are the source of
/// truth for the exact amounts actually pulled (mint/increaseLiquidity only ever use <= the amounts
/// passed in).

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

export const FEE_TIERS: { fee: number; label: string; tickSpacing: number }[] = [
  { fee: 500, label: '0.05%', tickSpacing: 10 },
  { fee: 3000, label: '0.3%', tickSpacing: 60 },
  { fee: 10000, label: '1%', tickSpacing: 200 },
];

export function tickSpacingForFee(fee: number): number {
  return FEE_TIERS.find((f) => f.fee === fee)?.tickSpacing ?? 60;
}

export function nearestUsableTick(tick: number, tickSpacing: number): number {
  const rounded = Math.round(tick / tickSpacing) * tickSpacing;
  if (rounded < MIN_TICK) return Math.ceil(MIN_TICK / tickSpacing) * tickSpacing;
  if (rounded > MAX_TICK) return Math.floor(MAX_TICK / tickSpacing) * tickSpacing;
  return rounded;
}

/// price is token1 per 1 token0, in human-readable (decimal-adjusted) units.
export function priceToTick(price: number, decimals0: number, decimals1: number): number {
  const rawPrice = price * 10 ** (decimals1 - decimals0);
  return Math.log(rawPrice) / Math.log(1.0001);
}

export function tickToPrice(tick: number, decimals0: number, decimals1: number): number {
  const rawPrice = Math.pow(1.0001, tick);
  return rawPrice * 10 ** (decimals0 - decimals1);
}

export function sqrtPriceX96ToPrice(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
  const rawPrice = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
  return rawPrice * 10 ** (decimals0 - decimals1);
}

export function priceToSqrtPriceX96(price: number, decimals0: number, decimals1: number): bigint {
  const rawPrice = price * 10 ** (decimals1 - decimals0);
  const sqrtRaw = Math.sqrt(rawPrice);
  return BigInt(Math.floor(sqrtRaw * 2 ** 96));
}

/// Given a known amount of token0, suggests the amount of token1 that matches the current price and
/// the chosen [minPrice, maxPrice] range. Returns 0 if the range is entirely above current price
/// (position would be 100% token0), or NaN if entirely below (position would be 100% token1, so an
/// amount0 input doesn't determine anything).
export function suggestAmount1FromAmount0(
  amount0: number,
  currentPrice: number,
  minPrice: number,
  maxPrice: number
): number {
  if (currentPrice <= minPrice) return 0;
  if (currentPrice >= maxPrice) return NaN;
  const sqrtP = Math.sqrt(currentPrice);
  const sqrtPa = Math.sqrt(minPrice);
  const sqrtPb = Math.sqrt(maxPrice);
  const liquidity = (amount0 * sqrtP * sqrtPb) / (sqrtPb - sqrtP);
  return liquidity * (sqrtP - sqrtPa);
}

/// Estimates the raw token0/token1 amounts a given liquidity removal would return, from the pool's
/// current sqrtPriceX96 and the position's tick range. Used to derive a slippage-protected
/// amount0Min/amount1Min for decreaseLiquidity - same float-precision caveat as the rest of this file
/// applies, so callers should apply a slippage tolerance rather than using this as an exact minimum.
export function getAmountsForLiquidity(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint
): { amount0: number; amount1: number } {
  const sqrtRatioCurrent = Number(sqrtPriceX96) / 2 ** 96;
  const sqrtRatioLower = Math.pow(1.0001, tickLower / 2);
  const sqrtRatioUpper = Math.pow(1.0001, tickUpper / 2);
  const l = Number(liquidity);

  if (sqrtRatioCurrent <= sqrtRatioLower) {
    return { amount0: l * (1 / sqrtRatioLower - 1 / sqrtRatioUpper), amount1: 0 };
  }
  if (sqrtRatioCurrent >= sqrtRatioUpper) {
    return { amount0: 0, amount1: l * (sqrtRatioUpper - sqrtRatioLower) };
  }
  return {
    amount0: l * (1 / sqrtRatioCurrent - 1 / sqrtRatioUpper),
    amount1: l * (sqrtRatioCurrent - sqrtRatioLower),
  };
}

export function suggestAmount0FromAmount1(
  amount1: number,
  currentPrice: number,
  minPrice: number,
  maxPrice: number
): number {
  if (currentPrice >= maxPrice) return 0;
  if (currentPrice <= minPrice) return NaN;
  const sqrtP = Math.sqrt(currentPrice);
  const sqrtPa = Math.sqrt(minPrice);
  const sqrtPb = Math.sqrt(maxPrice);
  const liquidity = amount1 / (sqrtP - sqrtPa);
  return (liquidity * (sqrtPb - sqrtP)) / (sqrtP * sqrtPb);
}
