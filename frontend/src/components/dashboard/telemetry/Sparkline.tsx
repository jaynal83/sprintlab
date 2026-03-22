// ── Sparkline ──────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback } from 'react';

export function Sparkline({
  data,
  color = '#38bdf8',
  height = 24,
  playheadPct,
  onSeek,
  unit,
  precision = 1,
}: {
  data: number[];
  color?: string;
  height?: number;
  playheadPct?: number;
  /** Called with the data-index when the user clicks. */
  onSeek?: (index: number) => void;
  /** Unit label shown in the tooltip (e.g. "°", "m/s"). */
  unit?: string;
  /** Decimal places for the tooltip value. */
  precision?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ pct: number; value: number } | null>(null);

  const indexFromEvent = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || data.length < 2) return null;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const idx = Math.round(x * (data.length - 1));
      return Math.max(0, Math.min(data.length - 1, idx));
    },
    [data],
  );

  const onPointerMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const idx = indexFromEvent(e);
      if (idx === null) return;
      setHover({ pct: (idx / (data.length - 1)) * 100, value: data[idx] });
    },
    [data, indexFromEvent],
  );

  const onClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!onSeek) return;
      const idx = indexFromEvent(e);
      if (idx !== null) onSeek(idx);
    },
    [onSeek, indexFromEvent],
  );

  if (data.length < 2) return <div style={{ height }} className="w-full" />;

  const min = Math.min(...data),
    max = Math.max(...data);
  const range = max - min || 1;
  const W = 100,
    H = height;
  const pts = data
    .map(
      (v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`,
    )
    .join(' ');

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className={`w-full overflow-visible ${onSeek ? 'cursor-crosshair' : ''}`}
      style={{ height }}
      preserveAspectRatio="none"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
      onClick={onClick}
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />

      {/* Playhead */}
      {playheadPct != null && (
        <line
          x1={playheadPct}
          y1={0}
          x2={playheadPct}
          y2={H}
          stroke={color}
          strokeWidth="0.8"
          opacity="0.7"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Hover crosshair + tooltip */}
      {hover && (
        <>
          <line
            x1={hover.pct}
            y1={0}
            x2={hover.pct}
            y2={H}
            stroke="#a1a1aa"
            strokeWidth="0.6"
            strokeDasharray="2 1"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={hover.pct}
            cy={H - ((hover.value - min) / range) * H}
            r="2"
            fill={color}
            vectorEffect="non-scaling-stroke"
          />
          {/* Value tooltip - rendered as SVG text for simplicity */}
          <rect
            x={hover.pct > 70 ? hover.pct - 22 : hover.pct + 2}
            y={1}
            width="20"
            height="7"
            rx="1"
            fill="rgba(0,0,0,0.75)"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={hover.pct > 70 ? hover.pct - 12 : hover.pct + 12}
            y={6}
            textAnchor="middle"
            fill="white"
            fontSize="4.5"
            fontFamily="monospace"
            vectorEffect="non-scaling-stroke"
          >
            {hover.value.toFixed(precision)}{unit ?? ''}
          </text>
        </>
      )}
    </svg>
  );
}
