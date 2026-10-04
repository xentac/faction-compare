import { useMemo, useState } from "react";
import { fitName, MeasureText } from "./axis-names";
import {
  AttackerTimeToHits,
  Direction,
  formatWait,
  TimeToHits,
  WaitEstimate,
} from "./direction";
import { NAME_FORMS, NARROW_BELOW, useMeasuredWidth } from "./target-heatmap";
import { useTextMeasure } from "./use-text-measure";

// The height of one attacker's row; every row is always shown.
export const ROW_HEIGHT = 14;
// The height of the time axis above the rows.
export const AXIS_HEIGHT = 20;
// Time axis ticks are at least this far apart.
export const TICK_SPACING = 50;
// The gap between the name column and the plot, and the room right of the
// plot for the last dot and the end of the last tick label.
const NAME_GAP = 6;
const RIGHT_ROOM = 14;
// The time axis covers at least this many minutes, so a chart of short waits
// does not stretch a few minutes across the card.
const SHORTEST_AXIS = 60;
const DOT_RADIUS = 2.5;
// Each row has two lanes, one per case: full stays this far above the middle
// of the row, the med-out case this far below.
const LANE_OFFSET = 3;
const HOLLOW_STROKE = 1.25;
// The two cases of the estimate, in the order they are drawn and explained.
const CASES = [
  {
    key: "fullStays",
    hollow: false,
    lane: -LANE_OFFSET,
    legend: "defenders serve full stays",
  },
  {
    key: "medOut",
    hollow: true,
    lane: LANE_OFFSET,
    legend: "defenders med out",
  },
] as const;
// The figure printed on a hovered row is in the regular weight.
const FIGURE_FORMS = ["normal"];
// How far the figure's backing reaches past its text on each side.
const FIGURE_PADDING = 3;
// Where the words of a row with no time start, from the left of the plot.
const WORDS_INSET = 4;

// The space around the rows. Like the heatmap's, it depends only on the
// card's width, never on the members.
export interface RankedLayout {
  fontSize: number;
  // The width of the name column: fits a 15-character bold name at both
  // widths. A wider name is cut to fit.
  nameSpace: number;
  left: number;
  right: number;
}

export function rankedLayout(cardWidth: number): RankedLayout {
  const narrow = cardWidth < NARROW_BELOW;
  const nameSpace = narrow ? 86 : 96;
  return {
    fontSize: narrow ? 9 : 10,
    nameSpace,
    left: nameSpace + NAME_GAP,
    right: RIGHT_ROOM,
  };
}

// The hours at which the time axis has a tick: whole steps from zero, with
// the step the smallest that keeps ticks TICK_SPACING pixels apart on a plot
// `width` pixels wide covering `minutes`.
export function axisTicks(minutes: number, width: number): number[] {
  if (!(minutes > 0) || !(width > 0)) {
    return [0];
  }
  const steps = [0.5, 1, 2, 3, 4, 6, 8, 12, 24];
  const pixelsPerHour = (width / minutes) * 60;
  let step = steps.find((each) => each * pixelsPerHour >= TICK_SPACING);
  if (step == null) {
    step = 48;
    while (step * pixelsPerHour < TICK_SPACING) {
      step *= 2;
    }
  }
  const ticks = [];
  for (let hours = 0; hours * 60 <= minutes; hours += step) {
    ticks.push(hours);
  }
  return ticks;
}

// The longest time on the chart, in minutes: where the time axis ends.
function longestTime(estimate: TimeToHits): number {
  let longest = SHORTEST_AXIS;
  for (const attacker of estimate.attackers) {
    for (const { key } of CASES) {
      const wait = attacker[key];
      if (wait.kind === "time") {
        longest = Math.max(longest, wait.p90);
      }
    }
  }
  return longest;
}

// What stands between the two cases of a figure printed on one line.
const FIGURE_SEPARATOR = " · ";

// The figure printed on a hovered row: both cases' medians with their bands.
export function hoverFigure(waits: AttackerTimeToHits): string | null {
  if (waits.fullStays.kind !== "time" || waits.medOut.kind !== "time") {
    return null;
  }
  return [
    formatWait(waits.fullStays),
    `med out ${formatWait(waits.medOut)}`,
  ].join(FIGURE_SEPARATOR);
}

// The gap between the whiskers and the figure printed beside them.
export const FIGURE_GAP = 6;

// Where a hovered row's figure is printed. `start` and `end` are the ends of
// the row's whiskers and `x` the left end of the figure, all in pixels from
// the left of the plot; the card runs from -leftRoom to plotWidth + rightRoom.
// `width` is the width the figure is drawn in.
export function figurePlacement({
  start,
  end,
  textWidth,
  plotWidth,
  leftRoom,
  rightRoom,
}: {
  start: number;
  end: number;
  textWidth: number;
  plotWidth: number;
  leftRoom: number;
  rightRoom: number;
}): { x: number; width: number } {
  const cardRight = plotWidth + rightRoom;
  if (end + FIGURE_GAP + textWidth <= cardRight) {
    return { x: end + FIGURE_GAP, width: textWidth };
  }
  // Left of the whiskers it must not run over the name.
  if (start - FIGURE_GAP - textWidth >= 0) {
    return { x: start - FIGURE_GAP - textWidth, width: textWidth };
  }
  // No room on either side: it ends at the card's edge, over the whiskers,
  // and is squeezed if the whole card is too narrow for it.
  const width = Math.min(textWidth, leftRoom + cardRight);
  return { x: cardRight - width, width };
}

// How a hovered row's figure is laid out: on one line where that leaves the
// name uncovered, otherwise on two lines, one per case, which start together
// and are placed by the longer one. `wholeWidth` is the width of the one line,
// `lineWidths` those of the two.
export function figureLayout({
  wholeWidth,
  lineWidths,
  ...row
}: {
  start: number;
  end: number;
  wholeWidth: number;
  lineWidths: number[];
  plotWidth: number;
  leftRoom: number;
  rightRoom: number;
}): { x: number; width: number; split: boolean } {
  const whole = figurePlacement({ ...row, textWidth: wholeWidth });
  if (whole.x >= 0) {
    return { ...whole, split: false };
  }
  return {
    ...figurePlacement({ ...row, textWidth: Math.max(...lineWidths) }),
    split: true,
  };
}

// One case's mark: a line from the 10th to the 90th percentile and a dot at
// the median, filled for full stays and hollow for the med-out case. The x
// positions are in pixels.
function WaitMark({
  p10,
  median,
  p90,
  y,
  hollow,
}: {
  p10: number;
  median: number;
  p90: number;
  y: number;
  hollow: boolean;
}) {
  return (
    <>
      <line
        x1={p10}
        x2={p90}
        y1={y}
        y2={y}
        strokeWidth={1.5}
        className="stroke-foreground/50"
      />
      {hollow ? (
        <circle
          cx={median}
          cy={y}
          r={DOT_RADIUS - HOLLOW_STROKE / 2}
          strokeWidth={HOLLOW_STROKE}
          className="fill-card stroke-foreground"
        />
      ) : (
        <circle cx={median} cy={y} r={DOT_RADIUS} className="fill-foreground" />
      )}
    </>
  );
}

// The figures of a hovered row, printed beside its whiskers on a backing of
// the highlight's colour, which hides the whiskers where it has to cover them.
// `y` is the top of the row. A figure split in two has its second line on the
// row below, or its first on the row above when the row is the last.
function HoverFigure({
  waits,
  x,
  y,
  lastRow,
  plotWidth,
  layout,
  measure,
}: {
  waits: AttackerTimeToHits;
  x: (minutes: number) => number;
  y: number;
  lastRow: boolean;
  plotWidth: number;
  layout: RankedLayout;
  measure: MeasureText;
}) {
  const figure = hoverFigure(waits);
  if (figure == null) {
    return null;
  }
  const parts = figure.split(FIGURE_SEPARATOR);
  let start = Infinity;
  let end = -Infinity;
  for (const { key } of CASES) {
    const wait = waits[key];
    if (wait.kind === "time") {
      start = Math.min(start, x(Math.min(wait.p10, wait.median)) - DOT_RADIUS);
      end = Math.max(end, x(Math.max(wait.p90, wait.median)) + DOT_RADIUS);
    }
  }
  const placed = figureLayout({
    start,
    end,
    wholeWidth: measure(figure),
    lineWidths: parts.map(measure),
    plotWidth,
    leftRoom: layout.left,
    // Drawn text can be a fraction of a pixel wider than it measured.
    rightRoom: layout.right - 1,
  });
  const lines = placed.split ? parts : [figure];
  const top = placed.split && lastRow ? y - ROW_HEIGHT : y;
  return (
    <g pointerEvents="none">
      <rect
        x={placed.x - FIGURE_PADDING}
        y={top}
        width={placed.width + 2 * FIGURE_PADDING}
        height={lines.length * ROW_HEIGHT}
        className="fill-muted"
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={placed.x}
          y={top + i * ROW_HEIGHT + ROW_HEIGHT / 2}
          dominantBaseline="central"
          className="fill-foreground"
          {...(placed.width < measure(line) && {
            textLength: placed.width,
            lengthAdjust: "spacingAndGlyphs",
          })}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function RankedLegend() {
  return (
    <div className="text-muted-foreground mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span>median wait for targets, with the 10th to 90th percentile:</span>
      {CASES.map(({ key, hollow, legend }) => (
        <span key={key} className="flex items-center gap-x-1.5">
          <svg width={26} height={10} aria-hidden="true">
            <WaitMark p10={1} median={13} p90={25} y={5} hollow={hollow} />
          </svg>
          <span>{legend}</span>
        </span>
      ))}
    </div>
  );
}

// The ranked chart of one direction of the war: one row per attacker,
// strongest first, showing how long they wait for targets before reaching
// the hit goal. `estimate` is null while it is being computed. Hovering a row
// highlights it and prints its figures; clicking it selects its attacker.
export function RankedChart({
  direction,
  estimate,
  onSelectAttacker,
}: {
  direction: Direction;
  estimate: TimeToHits | null;
  onSelectAttacker?: (memberId: number) => void;
}) {
  // The hovered row, by its attacker's member id.
  const [hovered, setHovered] = useState<number | null>(null);
  const [containerRef, { width }] = useMeasuredWidth<HTMLDivElement>();
  const layout = useMemo(() => rankedLayout(width), [width]);
  const plotWidth = Math.max(0, width - layout.left - layout.right);

  // The heatmap's attacker order reversed: strongest first, members with no
  // battle score estimate last. Each row keeps its index on the attacker
  // axis, which is also its index into the estimate.
  const rows = useMemo(
    () =>
      direction.attackers
        .map((attacker, index) => ({ attacker, index }))
        .reverse(),
    [direction.attackers],
  );

  const measure = useTextMeasure(containerRef, NAME_FORMS, layout.fontSize);
  const names = useMemo(
    () =>
      measure &&
      rows.map(({ attacker }) =>
        fitName(attacker.name, layout.nameSpace, measure),
      ),
    [rows, layout.nameSpace, measure],
  );

  const measureFigure = useTextMeasure(
    containerRef,
    FIGURE_FORMS,
    layout.fontSize,
  );

  // An estimate for another set of attackers is never drawn.
  const shown =
    estimate && estimate.attackers.length === direction.attackers.length
      ? estimate
      : null;
  const longest = shown ? longestTime(shown) : 0;
  const ticks = useMemo(
    () => axisTicks(longest, plotWidth),
    [longest, plotWidth],
  );
  const x = (minutes: number) => (minutes / longest) * plotWidth;
  const rowsHeight = rows.length * ROW_HEIGHT;
  const hoveredRow = rows.findIndex(({ attacker }) => attacker.id === hovered);
  const hoveredWaits =
    hoveredRow >= 0 ? shown?.attackers[rows[hoveredRow].index] : undefined;

  return (
    <div>
      <RankedLegend />
      <div ref={containerRef} className="w-full">
        <svg
          width="100%"
          height={AXIS_HEIGHT + rowsHeight}
          className="block"
          role="img"
          aria-label={`Time to the hit goal for ${rows.length} attackers`}
          onPointerLeave={() => setHovered(null)}
        >
          {plotWidth > 0 && (
            <g
              transform={`translate(${layout.left} 0)`}
              fontSize={layout.fontSize}
              className="select-none"
            >
              {shown ? (
                <g
                  className="fill-muted-foreground"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {ticks.map((hours) => (
                    <g key={hours} transform={`translate(${x(hours * 60)} 0)`}>
                      <text y={AXIS_HEIGHT / 2 - 2}>
                        {hours === 0 ? "0" : `${hours}h`}
                      </text>
                      <line
                        y1={AXIS_HEIGHT - 4}
                        y2={AXIS_HEIGHT + rowsHeight}
                        strokeWidth={1}
                        shapeRendering="crispEdges"
                        className="stroke-foreground/10"
                      />
                    </g>
                  ))}
                </g>
              ) : (
                <text
                  x={WORDS_INSET}
                  y={AXIS_HEIGHT / 2 - 2}
                  dominantBaseline="central"
                  className="fill-muted-foreground italic"
                >
                  computing…
                </text>
              )}
              <g transform={`translate(0 ${AXIS_HEIGHT})`}>
                {rows.map(({ attacker, index }, row) => {
                  const y = row * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const waits = shown?.attackers[index];
                  // Whether there is a time at all is the same in both
                  // cases, so the words are written once.
                  const kind = waits?.fullStays.kind;
                  const isHovered = hovered === attacker.id;
                  return (
                    <g
                      key={attacker.id}
                      className="cursor-pointer"
                      // Hover is for a mouse only: a tapped row would
                      // otherwise stay highlighted. A tap still selects.
                      onPointerEnter={(event) =>
                        setHovered(
                          event.pointerType === "mouse" ? attacker.id : null,
                        )
                      }
                      onClick={() => onSelectAttacker?.(attacker.id)}
                    >
                      {/* The highlight, and at rest the row's hit area. */}
                      <rect
                        x={-layout.left}
                        y={row * ROW_HEIGHT}
                        width={width}
                        height={ROW_HEIGHT}
                        className={
                          isHovered ? "fill-muted" : "fill-transparent"
                        }
                      />
                      {names && (
                        <text
                          x={-NAME_GAP}
                          y={y}
                          textAnchor="end"
                          dominantBaseline="central"
                          className={
                            isHovered
                              ? "fill-foreground font-bold"
                              : "fill-muted-foreground"
                          }
                        >
                          {names[row]}
                        </text>
                      )}
                      {waits &&
                        CASES.map(({ key, hollow, lane }) => {
                          const wait: WaitEstimate = waits[key];
                          return (
                            wait.kind === "time" && (
                              <WaitMark
                                key={key}
                                p10={x(wait.p10)}
                                median={x(wait.median)}
                                p90={x(wait.p90)}
                                y={y + lane}
                                hollow={hollow}
                              />
                            )
                          );
                        })}
                      {kind === "never" && (
                        <text
                          x={WORDS_INSET}
                          y={y}
                          dominantBaseline="central"
                          className="fill-red-600 italic dark:fill-red-400"
                        >
                          never (no targets)
                        </text>
                      )}
                      {kind === "none" && (
                        <text
                          x={WORDS_INSET}
                          y={y}
                          dominantBaseline="central"
                          className="fill-muted-foreground italic"
                        >
                          no estimate
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* After the rows: its second line lies over another row. */}
                {hoveredWaits && measureFigure && (
                  <HoverFigure
                    waits={hoveredWaits}
                    x={x}
                    y={hoveredRow * ROW_HEIGHT}
                    lastRow={hoveredRow === rows.length - 1}
                    plotWidth={plotWidth}
                    layout={layout}
                    measure={measureFigure}
                  />
                )}
              </g>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
