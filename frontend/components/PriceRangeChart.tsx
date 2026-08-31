'use client';

/// Lightweight log-scale bar visualizing a [minPrice, maxPrice] liquidity range against the current
/// pool price. No charting library involved - just a positioned div over a log-scaled domain that
/// expands to whatever range is being edited.
export function PriceRangeChart({
  currentPrice,
  minPrice,
  maxPrice,
  quoteSymbol,
  baseSymbol,
}: {
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  quoteSymbol: string;
  baseSymbol: string;
}) {
  if (!isFinite(currentPrice) || currentPrice <= 0) return null;

  const safeMin = isFinite(minPrice) && minPrice > 0 ? minPrice : currentPrice * 0.5;
  const safeMax = isFinite(maxPrice) && maxPrice > 0 ? maxPrice : currentPrice * 1.5;

  const domainLow = Math.log(Math.min(safeMin, currentPrice) * 0.5);
  const domainHigh = Math.log(Math.max(safeMax, currentPrice) * 2);
  const span = domainHigh - domainLow || 1;

  const pct = (p: number) => {
    const clamped = Math.min(Math.max(Math.log(p), domainLow), domainHigh);
    return ((clamped - domainLow) / span) * 100;
  };

  const leftPct = pct(safeMin);
  const rightPct = pct(safeMax);
  const currentPct = pct(currentPrice);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-8 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div
          className="absolute top-0 bottom-0 bg-blue-200 dark:bg-blue-900/50"
          style={{ left: `${leftPct}%`, width: `${Math.max(rightPct - leftPct, 0.5)}%` }}
        />
        <div className="absolute top-0 bottom-0 w-0.5 bg-blue-600" style={{ left: `${currentPct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>Min {safeMin.toPrecision(6)}</span>
        <span className="text-blue-600 dark:text-blue-400">Current {currentPrice.toPrecision(6)}</span>
        <span>Max {safeMax.toPrecision(6)}</span>
      </div>
      <div className="text-xs text-gray-400 text-right">
        {quoteSymbol} per {baseSymbol}
      </div>
    </div>
  );
}
