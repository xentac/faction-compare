import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { DIFFICULTY_STEPS, Direction } from "./direction";

// The height of the cell area at every screen width.
export const PLOT_HEIGHT = 500;
// Space around the cell area inside the SVG, for the edge bars and axis names.
export const PLOT_MARGIN = { top: 0, right: 0, bottom: 0, left: 0 };
// A guide line is drawn between every GUIDE_EVERY members on both axes.
export const GUIDE_EVERY = 10;

// Difficulty colours, easiest to hardest, as SVG fills and as legend swatch
// backgrounds. Red means harder in both themes. Written out in full so that
// Tailwind sees every class.
export const DIFFICULTY_FILL = [
  "fill-[#fd8d3c] dark:fill-[#feb24c]",
  "fill-[#fc4e2a] dark:fill-[#fd8d3c]",
  "fill-[#e31a1c] dark:fill-[#fc4e2a]",
  "fill-[#bd0026] dark:fill-[#e31a1c]",
  "fill-[#800026] dark:fill-[#bd0026]",
];
export const DIFFICULTY_BACKGROUND = [
  "bg-[#fd8d3c] dark:bg-[#feb24c]",
  "bg-[#fc4e2a] dark:bg-[#fd8d3c]",
  "bg-[#e31a1c] dark:bg-[#fc4e2a]",
  "bg-[#bd0026] dark:bg-[#e31a1c]",
  "bg-[#800026] dark:bg-[#bd0026]",
];

// Where the cells sit inside a plot of the given size. Attackers run left to
// right along the bottom and defenders bottom to top up the side, both in
// axis order. Every edge is rounded to a whole device pixel so neighbouring
// cells meet without a seam.
export interface PlotGeometry {
  width: number;
  height: number;
  // columnEdges[i] and columnEdges[i + 1] bound attacker i, left to right.
  columnEdges: number[];
  // rowEdges[j] and rowEdges[j + 1] bound defender j; rowEdges[0] is the
  // bottom of the plot, so the values decrease.
  rowEdges: number[];
}

export function plotGeometry(
  attackerCount: number,
  defenderCount: number,
  width: number,
  height: number,
  devicePixelRatio: number,
): PlotGeometry {
  const snap = (n: number) =>
    Math.round(n * devicePixelRatio) / devicePixelRatio;
  const edges = (count: number, length: number) =>
    Array.from({ length: count + 1 }, (_, i) => snap((i * length) / count));
  return {
    width,
    height,
    columnEdges: attackerCount > 0 ? edges(attackerCount, width) : [],
    rowEdges:
      defenderCount > 0
        ? edges(defenderCount, height).map((y) => snap(height) - y)
        : [],
  };
}

// One SVG path per difficulty step, covering every target of that step. Along
// one attacker's column, neighbouring defenders of the same step are merged
// into a single rectangle.
function difficultyPaths(direction: Direction, g: PlotGeometry): string[] {
  const paths = Array.from({ length: DIFFICULTY_STEPS }, () => "");
  direction.cells.forEach((column, a) => {
    const left = g.columnEdges[a];
    const right = g.columnEdges[a + 1];
    let start = 0;
    while (start < column.length) {
      const step = column[start].difficulty;
      let end = start + 1;
      while (end < column.length && column[end].difficulty === step) {
        end++;
      }
      if (step != null) {
        paths[step] +=
          `M${left} ${g.rowEdges[start]}H${right}V${g.rowEdges[end]}H${left}Z`;
      }
      start = end;
    }
  });
  return paths;
}

// The guide lines between every GUIDE_EVERY members on both axes.
function guidePath(g: PlotGeometry): string {
  let d = "";
  for (let i = GUIDE_EVERY; i < g.columnEdges.length - 1; i += GUIDE_EVERY) {
    d += `M${g.columnEdges[i]} 0V${g.height}`;
  }
  for (let j = GUIDE_EVERY; j < g.rowEdges.length - 1; j += GUIDE_EVERY) {
    d += `M0 ${g.rowEdges[j]}H${g.width}`;
  }
  return d;
}

// The width of an element's content box and the device pixel ratio, kept up
// to date as either changes. Width is 0 until first measured.
function useMeasuredWidth<T extends Element>() {
  const ref = useRef<T>(null);
  const [measured, setMeasured] = useState({ width: 0, devicePixelRatio: 1 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = () => {
      const width = element.clientWidth;
      const devicePixelRatio = window.devicePixelRatio || 1;
      setMeasured((previous) =>
        previous.width === width &&
        previous.devicePixelRatio === devicePixelRatio
          ? previous
          : { width, devicePixelRatio },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // Zooming changes the device pixel ratio without always resizing the
    // element.
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return [ref, measured] as const;
}

function HeatmapLegend({ direction }: { direction: Direction }) {
  const { minimum, maximum } = direction.targetRange;
  return (
    <div className="text-muted-foreground mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span>easier</span>
      <span className="tabular-nums">{minimum.toFixed(2)}</span>
      <span className="flex" aria-hidden="true">
        {DIFFICULTY_BACKGROUND.map((background, step) => (
          <span key={step} className={`h-3 w-6 ${background}`} />
        ))}
      </span>
      <span className="tabular-nums">{maximum.toFixed(2)}</span>
      <span>harder</span>
    </div>
  );
}

// The target heatmap of one direction of the war: every target coloured by
// difficulty, attackers along the bottom and defenders up the side.
export function TargetHeatmap({ direction }: { direction: Direction }) {
  const [containerRef, { width, devicePixelRatio }] =
    useMeasuredWidth<HTMLDivElement>();
  const plotWidth = Math.max(0, width - PLOT_MARGIN.left - PLOT_MARGIN.right);

  const geometry = useMemo(
    () =>
      plotGeometry(
        direction.attackers.length,
        direction.defenders.length,
        plotWidth,
        PLOT_HEIGHT,
        devicePixelRatio,
      ),
    [
      direction.attackers.length,
      direction.defenders.length,
      plotWidth,
      devicePixelRatio,
    ],
  );
  const paths = useMemo(
    () => difficultyPaths(direction, geometry),
    [direction, geometry],
  );
  const guides = useMemo(() => guidePath(geometry), [geometry]);

  return (
    <div>
      <HeatmapLegend direction={direction} />
      <div ref={containerRef} className="w-full">
        <svg
          width="100%"
          height={PLOT_MARGIN.top + PLOT_HEIGHT + PLOT_MARGIN.bottom}
          className="block"
          role="img"
          aria-label={`Target heatmap: ${direction.attackers.length} attackers by ${direction.defenders.length} defenders`}
        >
          {plotWidth > 0 && (
            <g
              transform={`translate(${PLOT_MARGIN.left} ${PLOT_MARGIN.top})`}
              shapeRendering="crispEdges"
            >
              <path
                d={guides}
                fill="none"
                strokeWidth={1}
                className="stroke-foreground/10"
              />
              <rect
                x={0.5}
                y={0.5}
                width={Math.max(0, plotWidth - 1)}
                height={PLOT_HEIGHT - 1}
                fill="none"
                strokeWidth={1}
                className="stroke-border"
              />
              {paths.map((d, step) => (
                <path key={step} d={d} className={DIFFICULTY_FILL[step]} />
              ))}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
