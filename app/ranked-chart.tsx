import { useMemo } from "react";
import { fitName } from "./axis-names";
import { Direction, TimeToHits } from "./direction";
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
const DOT_RADIUS = 3;
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
  for (const { fullStays } of estimate.attackers) {
    if (fullStays.kind === "time") {
      longest = Math.max(longest, fullStays.p90);
    }
  }
  return longest;
}

function RankedLegend() {
  return (
    <div className="text-muted-foreground mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span className="flex items-center gap-x-1.5">
        <svg width={26} height={10} aria-hidden="true">
          <line
            x1={1}
            x2={25}
            y1={5}
            y2={5}
            strokeWidth={1.5}
            className="stroke-foreground/50"
          />
          <circle cx={13} cy={5} r={DOT_RADIUS} className="fill-foreground" />
        </svg>
        <span>median wait for targets, with the 10th to 90th percentile</span>
      </span>
    </div>
  );
}

// The ranked chart of one direction of the war: one row per attacker,
// strongest first, showing how long they wait for targets before reaching
// the hit goal. `estimate` is null while it is being computed.
export function RankedChart({
  direction,
  estimate,
}: {
  direction: Direction;
  estimate: TimeToHits | null;
}) {
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
                  const wait = shown?.attackers[index].fullStays;
                  return (
                    <g key={attacker.id}>
                      {names && (
                        <text
                          x={-NAME_GAP}
                          y={y}
                          textAnchor="end"
                          dominantBaseline="central"
                          className="fill-muted-foreground"
                        >
                          {names[row]}
                        </text>
                      )}
                      {wait?.kind === "time" && (
                        <>
                          <line
                            x1={x(wait.p10)}
                            x2={x(wait.p90)}
                            y1={y}
                            y2={y}
                            strokeWidth={1.5}
                            className="stroke-foreground/50"
                          />
                          <circle
                            cx={x(wait.median)}
                            cy={y}
                            r={DOT_RADIUS}
                            className="fill-foreground"
                          />
                        </>
                      )}
                      {wait?.kind === "never" && (
                        <text
                          x={WORDS_INSET}
                          y={y}
                          dominantBaseline="central"
                          className="fill-red-600 italic dark:fill-red-400"
                        >
                          never (no targets)
                        </text>
                      )}
                      {wait?.kind === "none" && (
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
              </g>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
