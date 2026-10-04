import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { fitName, labelEvery } from "./axis-names";
import { DIFFICULTY_STEPS, Direction } from "./direction";
import { useTextMeasure } from "./use-text-measure";

// The height of the cell area at every screen width.
export const PLOT_HEIGHT = 500;
// A card narrower than this gets the narrow layout.
export const NARROW_BELOW = 480;
// The forms a name is drawn in, each the leading part of a CSS font shorthand.
// A name is measured at the widest of them, so its text is the same in every
// state.
export const NAME_FORMS = ["bold"];
// The room one label needs along its axis; every nth name is shown so that
// labels are at least this far apart.
export const ATTACKER_LABEL_SPACING = 15;
export const DEFENDER_LABEL_SPACING = 12;
// The gap between the cell area and the bars on its top and right edges.
const BAR_GAP = 2;
// The gap between the cell area and the defender names on its left, and the
// drop from the cell area to where the attacker names end.
const DEFENDER_NAME_GAP = 6;
const ATTACKER_NAME_DROP = 8;
// Room past the end of the longest bar for a count printed beside it.
const TOP_COUNT_ROOM = 12;
const RIGHT_COUNT_ROOM = 22;

// The space around the cell area inside the SVG, which holds the edge bars
// and axis names. It depends only on the card's width, never on the members,
// so the plot keeps its width when factions reload.
export interface PlotLayout {
  margin: { top: number; right: number; bottom: number; left: number };
  // The font size of the axis names.
  fontSize: number;
  // The space reserved for a name on each axis; a wider name is cut to fit.
  // Attacker names are rotated, so theirs is a length along the slope.
  attackerNameSpace: number;
  defenderNameSpace: number;
  // The length of the bar of the largest target count and share count.
  targetBarLength: number;
  shareBarLength: number;
}

export function plotLayout(cardWidth: number): PlotLayout {
  const narrow = cardWidth < NARROW_BELOW;
  const fontSize = narrow ? 9 : 10;
  // Both fit a 15-character bold name, except the defender names on a narrow
  // card, where plot width is scarce.
  const attackerNameSpace = narrow ? 86 : 96;
  const defenderNameSpace = narrow ? 66 : 96;
  const targetBarLength = 28;
  const shareBarLength = narrow ? 22 : 34;
  return {
    margin: {
      top: TOP_COUNT_ROOM + targetBarLength + BAR_GAP,
      right: BAR_GAP + shareBarLength + RIGHT_COUNT_ROOM,
      bottom:
        ATTACKER_NAME_DROP +
        Math.ceil(attackerNameSpace * Math.SQRT1_2) +
        Math.ceil(fontSize / 2),
      left: defenderNameSpace + DEFENDER_NAME_GAP,
    },
    fontSize,
    attackerNameSpace,
    defenderNameSpace,
    targetBarLength,
    shareBarLength,
  };
}

// The length of one edge bar: counts are scaled so that the largest of their
// set is the longest bar. Any count above zero shows at least a sliver.
export function edgeBarLength(
  count: number,
  largest: number,
  longest: number,
): number {
  if (count <= 0 || largest <= 0) {
    return 0;
  }
  return Math.max(1, (count / largest) * longest);
}
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
// The edge bars are neutral ink, not ramp colours.
const BAR_FILL = "fill-foreground/40";
const BAR_BACKGROUND = "bg-foreground/40";
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

// The largest target count among the attackers and the largest share count
// among the defenders: what the longest bar of each set stands for.
interface LargestCounts {
  targetCount: number;
  shareCount: number;
}

function largestCounts(direction: Direction): LargestCounts {
  return {
    targetCount: direction.attackers.reduce(
      (largest, attacker) => Math.max(largest, attacker.targetCount),
      0,
    ),
    shareCount: direction.defenders.reduce(
      (largest, defender) => Math.max(largest, defender.shareCount),
      0,
    ),
  };
}

// The target count bars along the top edge and the share count bars along the
// right edge, each set as one SVG path in the plot's coordinates.
function edgeBarPaths(
  direction: Direction,
  g: PlotGeometry,
  layout: PlotLayout,
  counts: LargestCounts,
  devicePixelRatio: number,
): { targets: string; shares: string } {
  const snap = (n: number) =>
    Math.round(n * devicePixelRatio) / devicePixelRatio;
  let targets = "";
  direction.attackers.forEach((attacker, a) => {
    const length = snap(
      edgeBarLength(
        attacker.targetCount,
        counts.targetCount,
        layout.targetBarLength,
      ),
    );
    if (length > 0) {
      targets += `M${g.columnEdges[a]} ${-BAR_GAP}H${g.columnEdges[a + 1]}v${-length}H${g.columnEdges[a]}Z`;
    }
  });
  let shares = "";
  const left = g.width + BAR_GAP;
  direction.defenders.forEach((defender, d) => {
    const length = snap(
      edgeBarLength(
        defender.shareCount,
        counts.shareCount,
        layout.shareBarLength,
      ),
    );
    if (length > 0) {
      shares += `M${left} ${g.rowEdges[d + 1]}h${length}V${g.rowEdges[d]}H${left}Z`;
    }
  });
  return { targets, shares };
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

function HeatmapLegend({
  direction,
  counts,
}: {
  direction: Direction;
  counts: LargestCounts;
}) {
  const { minimum, maximum } = direction.targetRange;
  return (
    <div className="text-muted-foreground mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span className="flex items-center gap-x-2">
        <span>easier</span>
        <span className="tabular-nums">{minimum.toFixed(2)}</span>
        <span className="flex" aria-hidden="true">
          {DIFFICULTY_BACKGROUND.map((background, step) => (
            <span key={step} className={`h-3 w-6 ${background}`} />
          ))}
        </span>
        <span className="tabular-nums">{maximum.toFixed(2)}</span>
        <span>harder</span>
      </span>
      <span className="flex items-center gap-x-1.5">
        <span className={`h-3 w-1 ${BAR_BACKGROUND}`} aria-hidden="true" />
        <span>
          top bars: target count, up to{" "}
          <span className="tabular-nums">{counts.targetCount}</span>
        </span>
      </span>
      <span className="flex items-center gap-x-1.5">
        <span className={`h-1 w-3 ${BAR_BACKGROUND}`} aria-hidden="true" />
        <span>
          right bars: share count, up to{" "}
          <span className="tabular-nums">{counts.shareCount}</span>
        </span>
      </span>
    </div>
  );
}

// The axis names: every nth attacker name under the plot, rotated 45 degrees,
// and every nth defender name to its left. Inert, like the edge bars.
function AxisNames({
  direction,
  geometry,
  layout,
  attackerNames,
  defenderNames,
}: {
  direction: Direction;
  geometry: PlotGeometry;
  layout: PlotLayout;
  attackerNames: string[];
  defenderNames: string[];
}) {
  const attackerEvery = labelEvery(
    geometry.width / direction.attackers.length,
    ATTACKER_LABEL_SPACING,
  );
  const defenderEvery = labelEvery(
    geometry.height / direction.defenders.length,
    DEFENDER_LABEL_SPACING,
  );
  const { columnEdges, rowEdges } = geometry;
  return (
    <g
      className="fill-muted-foreground select-none"
      fontSize={layout.fontSize}
      textAnchor="end"
      dominantBaseline="central"
      pointerEvents="none"
    >
      {direction.attackers.map((attacker, a) =>
        a % attackerEvery === 0 ? (
          <text
            key={attacker.id}
            transform={`translate(${(columnEdges[a] + columnEdges[a + 1]) / 2} ${geometry.height + ATTACKER_NAME_DROP}) rotate(-45)`}
          >
            {attackerNames[a]}
          </text>
        ) : null,
      )}
      {direction.defenders.map((defender, d) =>
        d % defenderEvery === 0 ? (
          <text
            key={defender.id}
            x={-DEFENDER_NAME_GAP}
            y={(rowEdges[d] + rowEdges[d + 1]) / 2}
          >
            {defenderNames[d]}
          </text>
        ) : null,
      )}
    </g>
  );
}

// The target heatmap of one direction of the war: every target coloured by
// difficulty, attackers along the bottom and defenders up the side.
export function TargetHeatmap({ direction }: { direction: Direction }) {
  const [containerRef, { width, devicePixelRatio }] =
    useMeasuredWidth<HTMLDivElement>();
  const layout = useMemo(() => plotLayout(width), [width]);
  const { margin } = layout;
  const plotWidth = Math.max(0, width - margin.left - margin.right);

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
  const counts = useMemo(() => largestCounts(direction), [direction]);
  const bars = useMemo(
    () => edgeBarPaths(direction, geometry, layout, counts, devicePixelRatio),
    [direction, geometry, layout, counts, devicePixelRatio],
  );

  // Every member's name as it is written on its axis, cut to the reserved
  // space where it is too wide.
  const measure = useTextMeasure(containerRef, NAME_FORMS, layout.fontSize);
  const attackerNames = useMemo(
    () =>
      measure &&
      direction.attackers.map((attacker) =>
        fitName(attacker.name, layout.attackerNameSpace, measure),
      ),
    [direction.attackers, layout.attackerNameSpace, measure],
  );
  const defenderNames = useMemo(
    () =>
      measure &&
      direction.defenders.map((defender) =>
        fitName(defender.name, layout.defenderNameSpace, measure),
      ),
    [direction.defenders, layout.defenderNameSpace, measure],
  );

  return (
    <div>
      <HeatmapLegend direction={direction} counts={counts} />
      <div ref={containerRef} className="w-full">
        <svg
          width="100%"
          height={margin.top + PLOT_HEIGHT + margin.bottom}
          className="block"
          role="img"
          aria-label={`Target heatmap: ${direction.attackers.length} attackers by ${direction.defenders.length} defenders`}
        >
          {plotWidth > 0 && (
            <g
              transform={`translate(${margin.left} ${margin.top})`}
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
              <g className={BAR_FILL} pointerEvents="none">
                <path d={bars.targets} />
                <path d={bars.shares} />
              </g>
            </g>
          )}
          {plotWidth > 0 && attackerNames && defenderNames && (
            <g transform={`translate(${margin.left} ${margin.top})`}>
              <AxisNames
                direction={direction}
                geometry={geometry}
                layout={layout}
                attackerNames={attackerNames}
                defenderNames={defenderNames}
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
