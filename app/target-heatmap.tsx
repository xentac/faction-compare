import {
  KeyboardEvent,
  PointerEvent,
  ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fitName, labelEvery } from "./axis-names";
import { cellDetailRows, DetailRow } from "./cell-details";
import { DIFFICULTY_STEPS, Direction, TimeToHits } from "./direction";
import {
  canStepPin,
  closePin,
  firstArrowPin,
  Pin,
  pinnedCellIndex,
  PinStep,
  placePin,
  stepPin,
} from "./pinned-cell";
import { useTextMeasure } from "./use-text-measure";

// The height of the cell area at every screen width.
export const PLOT_HEIGHT = 500;
// A card narrower than this gets the narrow layout.
export const NARROW_BELOW = 480;
// The forms a name is drawn in, each the leading part of a CSS font shorthand.
// A name is measured at the widest of them, so its text is the same in every
// state.
export const NAME_FORMS = ["bold", "italic bold"];
// The room one label needs along its axis; every nth name is shown so that
// labels are at least this far apart.
export const ATTACKER_LABEL_SPACING = 15;
export const DEFENDER_LABEL_SPACING = 12;
// The gap between the cell area and the bars on its top and right edges.
const BAR_GAP = 2;
// The gap between the cell area and the defender names on its left, and the
// drop from the cell area to where the attacker names end.
const DEFENDER_NAME_GAP = 6;
const ATTACKER_NAME_DROP = 11;
// Room past the end of the longest bar for a count printed beside it.
const TOP_COUNT_ROOM = 12;
const RIGHT_COUNT_ROOM = 22;
// The gap between the end of a bar and the hovered count printed past it.
const COUNT_GAP = 3;
// How far a pointer may drift between going down and lifting and still count
// as a click or tap rather than a drag.
const TAP_SLOP = 8;
// The pin highlight's colour: unlike the hover crosshair's ink and unlike the
// difficulty ramp, in both themes.
const PIN_STROKE = "stroke-sky-600 dark:stroke-sky-400";
// The selected attacker on the attacker axis: the name italic and in the
// pin's colour (also when bold), and a small triangle at the foot of the
// column pointing up at it.
const SELECTED_NAME = "fill-sky-700 dark:fill-sky-300 italic";
const SELECTED_MARKER = "fill-sky-600 dark:fill-sky-400";
const SELECTED_MARKER_SIZE = 5;

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

// One cell of the heatmap, as indexes into the direction's two axes.
export interface CellIndex {
  attacker: number;
  defender: number;
}

// The index of the span holding a position, given the span edges in ascending
// order, or -1 when it is outside them. A span includes its lower edge.
function spanAt(position: number, edge: (i: number) => number, count: number) {
  if (count <= 0 || !(position >= edge(0)) || !(position < edge(count))) {
    return -1;
  }
  // Spans are near enough equal that this guess is at most a step off.
  let i = Math.min(
    count - 1,
    Math.floor(((position - edge(0)) / (edge(count) - edge(0))) * count),
  );
  while (i > 0 && position < edge(i)) {
    i--;
  }
  while (i < count - 1 && position >= edge(i + 1)) {
    i++;
  }
  return i;
}

// The cell drawn at a position in the plot's coordinates (x from the left of
// the cell area, y from its top), or null outside the cell area.
export function cellAt(
  g: PlotGeometry,
  x: number,
  y: number,
): CellIndex | null {
  const attackerCount = g.columnEdges.length - 1;
  const defenderCount = g.rowEdges.length - 1;
  const attacker = spanAt(x, (i) => g.columnEdges[i], attackerCount);
  // Row edges decrease from the bottom up; read them from the top down.
  const fromTop = spanAt(
    y,
    (i) => g.rowEdges[defenderCount - i],
    defenderCount,
  );
  if (attacker < 0 || fromTop < 0) {
    return null;
  }
  return { attacker, defender: defenderCount - 1 - fromTop };
}

// How far the tooltip sits from the pointer, and from the screen's edges.
const TOOLTIP_OFFSET = 12;
const TOOLTIP_EDGE = 4;

// Where the top left of the tooltip goes, in the coordinates of the pointer
// and the screen: below and to the right of the pointer, switching to its
// other side where it would run off the screen, and never off the screen.
export function tooltipPosition(
  pointer: { x: number; y: number },
  size: { width: number; height: number },
  screen: { width: number; height: number },
): { left: number; top: number } {
  const place = (at: number, length: number, available: number) => {
    const after = at + TOOLTIP_OFFSET;
    const before = at - TOOLTIP_OFFSET - length;
    const wanted = after + length + TOOLTIP_EDGE <= available ? after : before;
    return Math.max(
      TOOLTIP_EDGE,
      Math.min(wanted, available - length - TOOLTIP_EDGE),
    );
  };
  return {
    left: place(pointer.x, size.width, screen.width),
    top: place(pointer.y, size.height, screen.height),
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
export function useMeasuredWidth<T extends Element>() {
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
// and every nth defender name to its left. Inert, like the edge bars. The two
// names of the pinned cell and of the hovered cell are bold, whether or not
// they are among the every nth, and the selected attacker's name is always
// shown in its own style with a marker at the foot of its column. A pinned
// or selected name hides the every nth names it would overlap; while a cell
// is hovered the every nth names and the selected name are dimmed, the marker
// is not.
function AxisNames({
  direction,
  geometry,
  layout,
  attackerNames,
  defenderNames,
  hover,
  pin,
  selected,
}: {
  direction: Direction;
  geometry: PlotGeometry;
  layout: PlotLayout;
  attackerNames: string[];
  defenderNames: string[];
  hover: CellIndex | null;
  pin: CellIndex | null;
  // The selected attacker's index on the attacker axis.
  selected: number | null;
}) {
  const attackerSlot = geometry.width / direction.attackers.length;
  const defenderSlot = geometry.height / direction.defenders.length;
  const attackerEvery = labelEvery(attackerSlot, ATTACKER_LABEL_SPACING);
  const defenderEvery = labelEvery(defenderSlot, DEFENDER_LABEL_SPACING);
  // Whether the every nth name at an index is drawn at rest: not when it is
  // drawn bold instead, nor when it would overlap a name that wins over it
  // (the pinned name, the selected name).
  const resting = (
    index: number,
    every: number,
    slot: number,
    spacing: number,
    hovered: number | undefined,
    winners: (number | null | undefined)[],
  ) =>
    index % every === 0 &&
    index !== hovered &&
    winners.every(
      (winner) => winner == null || Math.abs(index - winner) * slot >= spacing,
    );
  const { columnEdges, rowEdges } = geometry;
  const columnCentre = (a: number) => (columnEdges[a] + columnEdges[a + 1]) / 2;
  // The selected attacker's name is in the selected style in every state.
  const attackerName = (a: number) => (
    <text
      key={direction.attackers[a].id}
      transform={`translate(${columnCentre(a)} ${geometry.height + ATTACKER_NAME_DROP}) rotate(-45)`}
      className={a === selected ? SELECTED_NAME : undefined}
    >
      {attackerNames[a]}
    </text>
  );
  // Bold when pinned or hovered; otherwise the selected name is drawn on its
  // own, dimmed with the every nth names while a cell is hovered.
  const selectedAtRest =
    selected != null &&
    selected !== pin?.attacker &&
    selected !== hover?.attacker;
  const defenderName = (d: number) => (
    <text
      key={direction.defenders[d].id}
      x={-DEFENDER_NAME_GAP}
      y={(rowEdges[d] + rowEdges[d + 1]) / 2}
    >
      {defenderNames[d]}
    </text>
  );
  return (
    <g
      className="select-none"
      fontSize={layout.fontSize}
      textAnchor="end"
      dominantBaseline="central"
      pointerEvents="none"
    >
      <g className="fill-muted-foreground" opacity={hover ? 0.4 : undefined}>
        {direction.attackers.map((_, a) =>
          resting(
            a,
            attackerEvery,
            attackerSlot,
            ATTACKER_LABEL_SPACING,
            hover?.attacker,
            [pin?.attacker, selected],
          )
            ? attackerName(a)
            : null,
        )}
        {direction.defenders.map((_, d) =>
          resting(
            d,
            defenderEvery,
            defenderSlot,
            DEFENDER_LABEL_SPACING,
            hover?.defender,
            [pin?.defender],
          )
            ? defenderName(d)
            : null,
        )}
      </g>
      {selectedAtRest && (
        <g opacity={hover ? 0.4 : undefined}>{attackerName(selected)}</g>
      )}
      {selected != null && (
        <path
          className={SELECTED_MARKER}
          d={`M${columnCentre(selected)} ${geometry.height + 1}l${SELECTED_MARKER_SIZE} ${SELECTED_MARKER_SIZE}h${-2 * SELECTED_MARKER_SIZE}Z`}
        />
      )}
      <g className="fill-foreground" fontWeight="bold">
        {pin && attackerName(pin.attacker)}
        {pin && defenderName(pin.defender)}
        {hover && hover.attacker !== pin?.attacker
          ? attackerName(hover.attacker)
          : null}
        {hover && hover.defender !== pin?.defender
          ? defenderName(hover.defender)
          : null}
      </g>
    </g>
  );
}

// The highlight of the pinned cell: its column and row ruled off along both
// sides and the cell itself boxed, all in the pin's own colour. Lines rather
// than the hover crosshair's tint, so the two can be told apart when both
// show, and drawn outside the cell so a cell 2 px wide stays visible.
function PinHighlight({
  geometry,
  pin,
}: {
  geometry: PlotGeometry;
  pin: CellIndex;
}) {
  const left = geometry.columnEdges[pin.attacker];
  const right = geometry.columnEdges[pin.attacker + 1];
  const bottom = geometry.rowEdges[pin.defender];
  const top = geometry.rowEdges[pin.defender + 1];
  return (
    <g pointerEvents="none" fill="none" className={PIN_STROKE}>
      <path
        d={
          `M${left - 0.5} 0V${geometry.height}M${right + 0.5} 0V${geometry.height}` +
          `M0 ${top - 0.5}H${geometry.width}M0 ${bottom + 0.5}H${geometry.width}`
        }
        strokeWidth={1}
      />
      <rect
        x={left - 2}
        y={top - 2}
        width={right - left + 4}
        height={bottom - top + 4}
        strokeWidth={2}
      />
    </g>
  );
}

// The crosshair on the hovered cell: its column and row tinted and the cell
// itself outlined. Drawn in the plot's coordinates, over the cells.
function HoverCrosshair({
  geometry,
  hover,
}: {
  geometry: PlotGeometry;
  hover: CellIndex;
}) {
  const left = geometry.columnEdges[hover.attacker];
  const right = geometry.columnEdges[hover.attacker + 1];
  const bottom = geometry.rowEdges[hover.defender];
  const top = geometry.rowEdges[hover.defender + 1];
  return (
    <g pointerEvents="none">
      <path
        d={`M${left} 0H${right}V${geometry.height}H${left}ZM0 ${top}H${geometry.width}V${bottom}H0Z`}
        className="fill-foreground/20"
      />
      <rect
        x={left - 0.5}
        y={top - 0.5}
        width={right - left + 1}
        height={bottom - top + 1}
        fill="none"
        strokeWidth={1}
        className="stroke-foreground"
      />
    </g>
  );
}

// The hovered attacker's and defender's bars at full strength, with the
// target count printed above the one and the share count beside the other.
function HoverCounts({
  direction,
  geometry,
  layout,
  counts,
  devicePixelRatio,
  hover,
}: {
  direction: Direction;
  geometry: PlotGeometry;
  layout: PlotLayout;
  counts: LargestCounts;
  devicePixelRatio: number;
  hover: CellIndex;
}) {
  const snap = (n: number) =>
    Math.round(n * devicePixelRatio) / devicePixelRatio;
  const attacker = direction.attackers[hover.attacker];
  const defender = direction.defenders[hover.defender];
  const left = geometry.columnEdges[hover.attacker];
  const right = geometry.columnEdges[hover.attacker + 1];
  const bottom = geometry.rowEdges[hover.defender];
  const top = geometry.rowEdges[hover.defender + 1];
  const targetBar = snap(
    edgeBarLength(
      attacker.targetCount,
      counts.targetCount,
      layout.targetBarLength,
    ),
  );
  const shareBar = snap(
    edgeBarLength(
      defender.shareCount,
      counts.shareCount,
      layout.shareBarLength,
    ),
  );
  return (
    <g className="fill-foreground select-none" pointerEvents="none">
      <path
        shapeRendering="crispEdges"
        d={
          `M${left} ${-BAR_GAP}H${right}v${-targetBar}H${left}Z` +
          `M${geometry.width + BAR_GAP} ${top}h${shareBar}V${bottom}h${-shareBar}Z`
        }
      />
      <g fontSize={layout.fontSize} className="tabular-nums">
        <text
          x={(left + right) / 2}
          y={-BAR_GAP - targetBar - COUNT_GAP}
          textAnchor="middle"
        >
          {attacker.targetCount}
        </text>
        <text
          x={geometry.width + BAR_GAP + shareBar + COUNT_GAP}
          y={(top + bottom) / 2}
          dominantBaseline="central"
        >
          {defender.shareCount}
        </text>
      </g>
    </g>
  );
}

// The detail rows of a cell, as the hover tooltip and the pinned-cell panel
// show them.
export function CellDetailRows({ rows }: { rows: DetailRow[] }) {
  return (
    <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1.5 leading-none">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`col-span-2 grid grid-cols-subgrid ${row.rule ? "border-border mt-0.5 border-t pt-2" : ""}`}
        >
          <span className="text-muted-foreground">{row.label}</span>
          <span className="text-foreground flex items-center justify-end gap-x-1.5 tabular-nums">
            {row.name != null && <span className="font-bold">{row.name}</span>}
            <span>{row.value}</span>
            {row.difficulty != null && (
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-[2px] ${DIFFICULTY_BACKGROUND[row.difficulty]}`}
                aria-hidden="true"
              />
            )}
          </span>
          {row.note != null && (
            <span className="text-muted-foreground col-span-2 mt-1 text-right">
              {row.note}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// The floating tooltip of the hovered cell, beside the pointer and kept on
// screen. The pointer position is in the browser window's coordinates.
function HoverTooltip({
  rows,
  pointer,
}: {
  rows: DetailRow[];
  pointer: { x: number; y: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Placed after every render, before the browser paints: its size depends on
  // the rows.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const { left, top } = tooltipPosition(
      pointer,
      { width: element.offsetWidth, height: element.offsetHeight },
      {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
    );
    element.style.transform = `translate(${left}px, ${top}px)`;
  });
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="border-border/50 bg-background text-foreground pointer-events-none fixed top-0 left-0 z-50 w-max max-w-[calc(100vw-8px)] rounded-lg border px-2.5 py-1.5 text-xs shadow-xl"
    >
      <CellDetailRows rows={rows} />
    </div>,
    document.body,
  );
}

// The panel of the pinned cell, directly below the plot: the step buttons and
// the close button in a row that stays put, then the cell's detail rows.
function PinPanel({
  rows,
  canStep,
  onStep,
  onClose,
}: {
  rows: DetailRow[];
  canStep: (step: PinStep) => boolean;
  onStep: (step: PinStep) => void;
  onClose: () => void;
}) {
  const stepButton = (step: PinStep, label: string, icon: ReactNode) => (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-8"
      aria-label={label}
      title={label}
      disabled={!canStep(step)}
      onClick={() => onStep(step)}
    >
      {icon}
    </Button>
  );
  return (
    <div
      role="group"
      aria-label="Pinned cell"
      className="mt-3 flex flex-col gap-3 rounded-lg border p-3 text-xs"
    >
      <div className="flex items-start gap-x-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-x-1.5">
            <span className="text-muted-foreground">Attacker</span>
            {stepButton(
              "previousAttacker",
              "Previous attacker",
              <ChevronLeft />,
            )}
            {stepButton("nextAttacker", "Next attacker", <ChevronRight />)}
          </span>
          <span className="flex items-center gap-x-1.5">
            <span className="text-muted-foreground">Defender</span>
            {stepButton(
              "previousDefender",
              "Previous defender",
              <ChevronDown />,
            )}
            {stepButton("nextDefender", "Next defender", <ChevronUp />)}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-8 shrink-0"
          aria-label="Close"
          title="Close"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="w-max max-w-full">
        <CellDetailRows rows={rows} />
      </div>
    </div>
  );
}

// The step each arrow key makes, as the panel's step buttons do: left and
// right along the attackers, up and down the defenders.
const ARROW_STEPS: Record<string, PinStep> = {
  ArrowLeft: "previousAttacker",
  ArrowRight: "nextAttacker",
  ArrowDown: "previousDefender",
  ArrowUp: "nextDefender",
};

// The hovered cell and where the pointer is, in the browser window's
// coordinates.
interface Hover {
  cell: CellIndex;
  pointer: { x: number; y: number };
}

// The target heatmap of one direction of the war: every target coloured by
// difficulty, attackers along the bottom and defenders up the side. Its pin
// is held by whoever renders it, so that it outlives the heatmap being
// unmounted; `onSelectAttacker` is told the pin's attacker whenever a pin is
// placed or its attacker stepped. `selectedAttackerId` is the selected member
// of the attacking faction, marked on the attacker axis. `timeToHits` is the direction's estimate for
// `hitGoal`, or null while it is being computed.
export function TargetHeatmap({
  direction,
  selectedAttackerId,
  timeToHits,
  hitGoal,
  pin,
  onPinChange,
  onSelectAttacker,
}: {
  direction: Direction;
  selectedAttackerId: number | null;
  timeToHits: TimeToHits | null;
  hitGoal: number;
  pin: Pin;
  onPinChange: (pin: Pin) => void;
  onSelectAttacker: (memberId: number) => void;
}) {
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

  // Hover is for a mouse only: a finger or pen never sets it, whatever the
  // device. Each pointer event says which it came from.
  const [hover, setHover] = useState<Hover | null>(null);
  const hoverAt = useCallback(
    (event: PointerEvent<SVGRectElement>) => {
      if (event.pointerType !== "mouse") {
        setHover(null);
        return;
      }
      const box = event.currentTarget.getBoundingClientRect();
      const cell = cellAt(
        geometry,
        event.clientX - box.left,
        event.clientY - box.top,
      );
      setHover(
        cell && { cell, pointer: { x: event.clientX, y: event.clientY } },
      );
    },
    [geometry],
  );
  const endHover = useCallback(() => setHover(null), []);
  // A cell that is still on the axes: the factions may have changed under a
  // resting pointer.
  const hoverCell =
    hover &&
    hover.cell.attacker < direction.attackers.length &&
    hover.cell.defender < direction.defenders.length
      ? hover.cell
      : null;
  const hoverAttacker = hoverCell?.attacker;
  const hoverDefender = hoverCell?.defender;
  const hoverRows = useMemo(
    () =>
      hoverAttacker != null && hoverDefender != null
        ? cellDetailRows(
            direction,
            { attacker: hoverAttacker, defender: hoverDefender },
            { hitGoal, estimate: timeToHits },
          )
        : null,
    [direction, hoverAttacker, hoverDefender, hitGoal, timeToHits],
  );

  // Moving the pin to a cell selects its attacker; the defender selects
  // nothing.
  const movePin = useCallback(
    (to: Pin) => {
      onPinChange(to);
      if (to && to.attackerId !== pin?.attackerId) {
        onSelectAttacker(to.attackerId);
      }
    },
    [pin, onPinChange, onSelectAttacker],
  );
  // A click or tap places the pin when the pointer lifts where it went down.
  // A drag never does: on a touch screen the browser takes it over to scroll
  // the page and cancels the pointer.
  const press = useRef<{ pointerId: number; x: number; y: number } | null>(
    null,
  );
  const startPress = useCallback(
    (event: PointerEvent<SVGRectElement>) => {
      hoverAt(event);
      press.current =
        event.isPrimary && event.button === 0
          ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
          : null;
    },
    [hoverAt],
  );
  const endPress = useCallback(
    (event: PointerEvent<SVGRectElement>) => {
      const down = press.current;
      press.current = null;
      if (
        !down ||
        down.pointerId !== event.pointerId ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > TAP_SLOP
      ) {
        return;
      }
      const box = event.currentTarget.getBoundingClientRect();
      const cell = cellAt(
        geometry,
        event.clientX - box.left,
        event.clientY - box.top,
      );
      const placed = cell && placePin(direction, cell);
      if (placed) {
        // Selected even when this attacker is already pinned: the selection
        // may have been changed elsewhere since.
        onPinChange(placed);
        onSelectAttacker(placed.attackerId);
      }
    },
    [direction, geometry, onPinChange, onSelectAttacker],
  );
  const cancelPress = useCallback(() => {
    press.current = null;
    setHover(null);
  }, []);

  const pinCell = useMemo(
    () => pinnedCellIndex(pin, direction),
    [pin, direction],
  );
  // Where the selected attacker sits on the attacker axis, if they are on it.
  const selectedAttacker = useMemo(() => {
    const index = direction.attackers.findIndex(
      (attacker) => attacker.id === selectedAttackerId,
    );
    return index < 0 ? null : index;
  }, [direction.attackers, selectedAttackerId]);
  const pinAttacker = pinCell?.attacker;
  const pinDefender = pinCell?.defender;
  const pinRows = useMemo(
    () =>
      pinAttacker != null && pinDefender != null
        ? cellDetailRows(
            direction,
            { attacker: pinAttacker, defender: pinDefender },
            { hitGoal, estimate: timeToHits },
          )
        : null,
    [direction, pinAttacker, pinDefender, hitGoal, timeToHits],
  );

  // The keys of the focused plot: the arrows step the pin, or place it when
  // nothing is pinned, and Escape closes it. Focus stays on the plot
  // throughout. An arrow never scrolls the page, even at the end of an axis.
  const pressKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (event.key === "Escape") {
        if (pin) {
          onPinChange(closePin());
        }
        return;
      }
      const step = ARROW_STEPS[event.key];
      if (!step) {
        return;
      }
      event.preventDefault();
      if (pinCell) {
        movePin(stepPin(pin, direction, step));
        return;
      }
      const placed = firstArrowPin(direction, selectedAttackerId);
      if (placed) {
        onPinChange(placed);
        onSelectAttacker(placed.attackerId);
      }
    },
    [
      direction,
      selectedAttackerId,
      pin,
      pinCell,
      movePin,
      onPinChange,
      onSelectAttacker,
    ],
  );

  return (
    <div>
      <HeatmapLegend direction={direction} counts={counts} />
      {/* The plot is the tab stop: a click on it focuses it too, so the arrow
          keys work after a click on a cell. */}
      <div
        ref={containerRef}
        className="focus-visible:ring-ring/50 w-full rounded-sm outline-none focus-visible:ring-[3px]"
        role="application"
        aria-label="Target heatmap: the arrow keys move the pinned cell, Escape closes it"
        tabIndex={0}
        onKeyDown={pressKey}
      >
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
              {pinCell && <PinHighlight geometry={geometry} pin={pinCell} />}
              {hoverCell && (
                <HoverCrosshair geometry={geometry} hover={hoverCell} />
              )}
              <g className={BAR_FILL} pointerEvents="none">
                <path d={bars.targets} />
                <path d={bars.shares} />
              </g>
              {/* The one set of pointer handlers: the cell under the pointer
                  is worked out from its position. */}
              <rect
                width={plotWidth}
                height={PLOT_HEIGHT}
                fill="transparent"
                onPointerMove={hoverAt}
                onPointerDown={startPress}
                onPointerUp={endPress}
                onPointerLeave={endHover}
                onPointerCancel={cancelPress}
              />
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
                hover={hoverCell}
                pin={pinCell}
                selected={selectedAttacker}
              />
              {hoverCell && (
                <HoverCounts
                  direction={direction}
                  geometry={geometry}
                  layout={layout}
                  counts={counts}
                  devicePixelRatio={devicePixelRatio}
                  hover={hoverCell}
                />
              )}
            </g>
          )}
        </svg>
      </div>
      {pinRows && (
        <PinPanel
          rows={pinRows}
          canStep={(step) => canStepPin(pin, direction, step)}
          onStep={(step) => movePin(stepPin(pin, direction, step))}
          onClose={() => onPinChange(closePin())}
        />
      )}
      {hover && hoverRows && (
        <HoverTooltip rows={hoverRows} pointer={hover.pointer} />
      )}
    </div>
  );
}
