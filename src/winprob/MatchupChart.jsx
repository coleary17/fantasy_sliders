import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { formatPercent, formatTime } from './data';

const HEIGHT = 180;
const TOP = 12;
const BOTTOM = 26;
const RIGHT_PAD = 56;
const LEFT_PAD = 12;
const TOOLTIP_WIDTH = 216;
const TOOLTIP_GAP = 10;
const GRID = '#34342f';
const MIDLINE = '#6f6e68';
const SURFACE = '#1a1a19';
const AREA_OPACITY = 0.2;

const yFor = (p) => TOP + (1 - p) * (HEIGHT - TOP - BOTTOM);

function buildSegments(points) {
  const solid = [];
  const breaks = [];
  points.forEach((point, i) => {
    if (i === 0) return;
    const prev = points[i - 1];
    const line = `M${prev.x},${prev.y}L${point.x},${point.y}`;
    (prev.live && point.live ? solid : breaks).push(line);
  });
  return { solid: solid.join(''), breaks: breaks.join('') };
}

function buildArea(points) {
  if (points.length < 2) return '';
  const mid = yFor(0.5);
  const line = points.map((p) => `L${p.x},${p.y}`).join('');
  return `M${points[0].x},${mid}${line}L${points.at(-1).x},${mid}Z`;
}

function ColorKey({ color }) {
  return <span className="mr-1.5 inline-block h-0.5 w-3 rounded-full align-middle" style={{ background: color }} aria-hidden="true" />;
}

export default function MatchupChart({ series, xs, ticks, contentWidth, nameA, nameB, colorA, colorB, scrollRef, onScroll }) {
  const [active, setActive] = useState(null);
  const scroller = useRef(null);
  const clipId = useId();

  const attachScroller = useCallback((el) => {
    scroller.current = el;
    scrollRef(el);
  }, [scrollRef]);

  const handleScrollEvent = (event) => {
    setActive(null); // a tooltip left behind would point at the wrong moment
    onScroll(event);
  };

  const points = useMemo(
    () => series.map((s, i) => ({ ...s, x: xs[i] + LEFT_PAD, y: yFor(s.probability) })),
    [series, xs],
  );
  const { solid, breaks } = useMemo(() => buildSegments(points), [points]);
  const area = useMemo(() => buildArea(points), [points]);
  const colorFor = (p) => (p >= 0.5 ? colorA : colorB);
  const svgWidth = contentWidth + LEFT_PAD + RIGHT_PAD;
  const last = points.at(-1);
  const hovered = active === null ? null : points[active.index];

  const nearestIndex = (x) => {
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(points[best].x - x)) best = i;
    });
    return best;
  };

  // Keep the tooltip inside the visible part of the chart, whatever the scroll position.
  const tooltipLeft = (x) => {
    const el = scroller.current;
    const scrollLeft = el?.scrollLeft ?? 0;
    const visibleWidth = el?.clientWidth ?? svgWidth;
    const onScreen = x - scrollLeft;
    const preferred = onScreen + TOOLTIP_GAP + TOOLTIP_WIDTH <= visibleWidth
      ? onScreen + TOOLTIP_GAP
      : onScreen - TOOLTIP_GAP - TOOLTIP_WIDTH;
    return Math.max(0, Math.min(preferred, visibleWidth - TOOLTIP_WIDTH));
  };

  const activate = (index) => setActive({ index, left: tooltipLeft(points[index].x) });

  const handlePointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    activate(nearestIndex(event.clientX - rect.left));
  };

  const handleKey = (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const step = event.key === 'ArrowLeft' ? -1 : 1;
      activate(Math.min(points.length - 1, Math.max(0, (active?.index ?? points.length - 1) + step)));
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  };

  // Fingers lift after a tap, so only a mouse leaving the chart dismisses the tooltip.
  const handlePointerLeave = (event) => {
    if (event.pointerType === 'mouse') setActive(null);
  };

  const summary = `Win probability over time for ${nameA} against ${nameB}. ${nameA} is at ${formatPercent(last.probability)} at the latest update. Use the left and right arrow keys to step through updates.`;

  return (
    <div className="flex">
      <div className="relative w-9 shrink-0 text-[11px] sm:w-11 sm:text-xs text-ink-3" style={{ height: HEIGHT }} aria-hidden="true">
        <span className="absolute right-1.5 -translate-y-1/2" style={{ top: yFor(1) }}>100%</span>
        <span className="absolute right-1.5 -translate-y-1/2" style={{ top: yFor(0.5) }}>50%</span>
        <span className="absolute right-1.5 -translate-y-1/2" style={{ top: yFor(0) }}>100%</span>
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute left-2 z-10 max-w-[80%] truncate rounded bg-surface/85 px-1 text-xs font-medium text-ink-2" style={{ top: yFor(1) + 2 }}>
          <ColorKey color={colorA} />↑ {nameA}
        </div>
        <div className="pointer-events-none absolute left-2 z-10 max-w-[80%] truncate rounded bg-surface/85 px-1 text-xs font-medium text-ink-2" style={{ top: yFor(0) - 20 }}>
          <ColorKey color={colorB} />↓ {nameB}
        </div>
        {hovered && (
          <div
            className="pointer-events-none absolute top-2 z-20 rounded-md border border-line bg-surface p-2 text-xs shadow-md"
            style={{ width: TOOLTIP_WIDTH, left: active.left }}
          >
            <div className="mb-1 text-ink-3">{formatTime(hovered.t)}</div>
            {[
              [nameA, hovered.a, hovered.probability, colorA],
              [nameB, hovered.b, 1 - hovered.probability, colorB],
            ].map(([name, team, probability, color]) => (
              <div key={name} className="mt-1">
                <div className="truncate text-ink-2"><ColorKey color={color} />{name}</div>
                <div className="text-ink-2">
                  <strong className="text-sm text-ink">{formatPercent(probability)}</strong>
                  {' · '}{team.points.toFixed(1)} pts · proj {team.expected.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={attachScroller} onScroll={handleScrollEvent} className="overflow-x-auto">
          <div className="relative" style={{ width: svgWidth, minWidth: '100%' }}>
            <svg
              width="100%"
              height={HEIGHT}
              role="img"
              aria-label={summary}
              tabIndex={0}
              onKeyDown={handleKey}
              onBlur={() => setActive(null)}
              onPointerMove={handlePointer}
              onPointerDown={handlePointer}
              onPointerLeave={handlePointerLeave}
              onPointerCancel={() => setActive(null)}
              className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              {[0, 1].map((p) => (
                <line key={p} x1={0} x2="100%" y1={yFor(p)} y2={yFor(p)} stroke={GRID} />
              ))}
              <line x1={0} x2="100%" y1={yFor(0.5)} y2={yFor(0.5)} stroke={MIDLINE} />
              {ticks.map((tick) => (
                <g key={tick.t}>
                  <line x1={tick.x + LEFT_PAD} x2={tick.x + LEFT_PAD} y1={yFor(0)} y2={yFor(0) + 4} stroke={MIDLINE} />
                  <text x={tick.x + LEFT_PAD} y={HEIGHT - 6} fontSize="11" fill="#9a9990" textAnchor={tick.x < 30 ? 'start' : 'middle'}>
                    {formatTime(tick.t)}
                  </text>
                </g>
              ))}
              <defs>
                <clipPath id={`${clipId}-a`}><rect x="0" y="0" width={svgWidth} height={yFor(0.5)} /></clipPath>
                <clipPath id={`${clipId}-b`}><rect x="0" y={yFor(0.5)} width={svgWidth} height={HEIGHT} /></clipPath>
              </defs>
              {[['a', colorA], ['b', colorB]].map(([side, color]) => (
                <g key={side} clipPath={`url(#${clipId}-${side})`}>
                  <path d={area} fill={color} fillOpacity={AREA_OPACITY} />
                  <path d={breaks} fill="none" stroke={color} strokeOpacity="0.7" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />
                  <path d={solid} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </g>
              ))}
              <circle cx={last.x} cy={last.y} r="4" fill={colorFor(last.probability)} stroke={SURFACE} strokeWidth="2" />
              <text x={last.x + 9} y={last.y + 4} fontSize="12" fontWeight="600" fill="#f0efec">
                {formatPercent(last.probability)}
              </text>
              {hovered && (
                <>
                  <line x1={hovered.x} x2={hovered.x} y1={yFor(1)} y2={yFor(0)} stroke="#9a9990" />
                  <circle cx={hovered.x} cy={hovered.y} r="4" fill={colorFor(hovered.probability)} stroke={SURFACE} strokeWidth="2" />
                </>
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
