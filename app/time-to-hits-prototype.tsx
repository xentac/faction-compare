"use client";
// PROTOTYPE, throwaway. Do not ship.
//
// Question (issue #9): how does the time-to-hits estimate appear on the page,
// and where do its two controls go?
//
// Three homes for the per-attacker estimate, on the target heatmap as settled
// in issues #4 and #5 (heat ramp, bars on two edges, legend above), mounted on
// the existing Faction Charts tab below the existing charts:
//
//   ?tth=A   on the heatmap's top edge, in place of (or beside) the target
//            count bars; the band as a whisker on the bar
//   ?tth=B   its own chart per direction: attackers ranked by estimate, a dot
//            at the median and a whisker for the band
//   ?tth=C   no overview on the chart tab: tooltip and pinned panel only, plus
//            a column in the Data tab's faction tables
//
// Toggles, independent of the variant:
//
//   ?edge=replace|join   A only: time bars replace the target bars, or stack
//                        above them
//   ?band=0|1            show the 10th-90th band outside the tooltip
//   ?fmt=hm|h|min        "5h 20m" | "5.3 h" | "320 min"
//   ?controls=config|strip|card   hit goal and med-out mode in the Change FF
//                        limits card, in a strip above the heatmaps, or in
//                        each heatmap card's header
//   ?goal=20 ?med=0|1    the two settings themselves
//
// The tooltip always carries the estimate. Every variant is shown for both
// directions of the war.

import {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTheme } from "next-themes";
import { ColumnDef } from "@tanstack/react-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GraphData } from "./types";
import { Estimate, simulate } from "./time-to-hits-sim";

// ---------------------------------------------------------------- options

const VARIANTS = [
  { key: "A", name: "Top edge of the heatmap" },
  { key: "B", name: "Ranked chart per direction" },
  { key: "C", name: "Tooltip, panel and Data tab column" },
];
const EDGES = ["replace", "join"] as const;
const FMTS = ["hm", "h", "min"] as const;
const CONTROLS = ["config", "strip", "card"] as const;

export interface Look {
  tth: string;
  edge: (typeof EDGES)[number];
  band: boolean;
  fmt: (typeof FMTS)[number];
  controls: (typeof CONTROLS)[number];
}

const DEFAULT_LOOK: Look = {
  tth: "A",
  edge: "replace",
  band: true,
  fmt: "hm",
  controls: "config",
};

// Settled in issue #5: 5-step heat ramp, red the hard end in both themes.
const HEAT_LIGHT = ["#fd8d3c", "#fc4e2a", "#e31a1c", "#bd0026", "#800026"];
const HEAT_DARK = ["#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#bd0026"];

// ---------------------------------------------------------------- time text

export function fmtMinutes(min: number, fmt: Look["fmt"]): string {
  if (fmt == "min") return `${Math.round(min)} min`;
  if (fmt == "h") return `${(min / 60).toFixed(1)} h`;
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 == 0 ? `${h}h` : `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return h % 24 == 0 ? `${d}d` : `${d}d ${h % 24}h`;
}

export function estimateText(
  e: Estimate | undefined,
  fmt: Look["fmt"],
  band: boolean,
): string {
  if (!e || e.kind == "blank") return "no estimate";
  if (e.kind == "never") return "never (no targets)";
  const med = fmtMinutes(e.p50, fmt);
  return band
    ? `${med} (${fmtMinutes(e.p10, fmt)} to ${fmtMinutes(e.p90, fmt)})`
    : med;
}

// ---------------------------------------------------------------- model

interface Model {
  attackers: GraphData[];
  defenders: GraphData[];
  na: number;
  nd: number;
  ff: Float32Array; // [j * na + i], NaN when either side has no estimate
  target: Uint8Array;
  shareCount: number[]; // per defender
  targetCount: number[]; // per attacker
  maxShare: number;
  maxTargets: number;
  total: number;
}

function buildModel(
  attackers: GraphData[],
  defenders: GraphData[],
  minFF: number,
  maxFF: number,
): Model {
  const na = attackers.length;
  const nd = defenders.length;
  const ff = new Float32Array(na * nd);
  const target = new Uint8Array(na * nd);
  const shareCount = new Array(nd).fill(0);
  const targetCount = new Array(na).fill(0);
  let total = 0;
  for (let j = 0; j < nd; j++) {
    const d = defenders[j].bss_public;
    for (let i = 0; i < na; i++) {
      const a = attackers[i].bss_public;
      const v = a == null || d == null || a == 0 ? NaN : 1 + (8 / 3) * (d / a);
      ff[j * na + i] = v;
      if (v >= minFF && v < maxFF) {
        target[j * na + i] = 1;
        shareCount[j]++;
        targetCount[i]++;
        total++;
      }
    }
  }
  return {
    attackers,
    defenders,
    na,
    nd,
    ff,
    target,
    shareCount,
    targetCount,
    maxShare: Math.max(1, ...shareCount),
    maxTargets: Math.max(1, ...targetCount),
    total,
  };
}

interface Direction {
  m: Model;
  est: Estimate[]; // per attacker, aligned with m.attackers
  byId: Map<number, Estimate>;
  maxTime: number; // largest p90 among timed attackers
  simMs: number;
}

function buildDirection(
  attackers: GraphData[],
  defenders: GraphData[],
  minFF: number,
  maxFF: number,
  goal: number,
  medOut: boolean,
): Direction {
  const m = buildModel(attackers, defenders, minFF, maxFF);
  const r = simulate(
    {
      na: m.na,
      nd: m.nd,
      target: m.target,
      hasEstimate: attackers.map((a) => a.bss_public != null),
    },
    { goal, medOut },
  );
  const byId = new Map<number, Estimate>();
  let maxTime = 0;
  r.estimates.forEach((e, i) => {
    byId.set(attackers[i].id, e);
    if (e.kind == "time") maxTime = Math.max(maxTime, e.p90);
  });
  return { m, est: r.estimates, byId, maxTime: Math.max(maxTime, 1), simMs: r.ms };
}

// ---------------------------------------------------------------- hook

export interface TimeToHits {
  look: Look;
  setLook: (next: Look) => void;
  goal: number;
  medOut: boolean;
  goalDraft: string;
  setGoalDraft: (s: string) => void;
  commitDraft: () => void; // apply the draft hit goal (the config form's Submit)
  setGoalNow: (n: number) => void;
  setMedOut: (b: boolean) => void;
  left: Direction;
  right: Direction;
}

function readLook(p: URLSearchParams): Look {
  const pick = <T extends string>(list: readonly T[], v: string | null, d: T) =>
    v && (list as readonly string[]).includes(v) ? (v as T) : d;
  return {
    tth: pick(
      VARIANTS.map((v) => v.key),
      p.get("tth"),
      DEFAULT_LOOK.tth,
    ),
    edge: pick(EDGES, p.get("edge"), DEFAULT_LOOK.edge),
    band: p.get("band") != "0",
    fmt: pick(FMTS, p.get("fmt"), DEFAULT_LOOK.fmt),
    controls: pick(CONTROLS, p.get("controls"), DEFAULT_LOOK.controls),
  };
}

function writeParams(patch: Record<string, string>) {
  const url = new URL(window.location.href);
  for (const k in patch) url.searchParams.set(k, patch[k]);
  window.history.replaceState(null, "", url);
}

export function useTimeToHitsPrototype(
  left: GraphData[],
  right: GraphData[],
  minFF: number,
  maxFF: number,
): TimeToHits {
  const [look, setLookState] = useState<Look>(DEFAULT_LOOK);
  const [goal, setGoal] = useState(20);
  const [goalDraft, setGoalDraft] = useState("20");
  const [medOut, setMedOutState] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setLookState(readLook(p));
    const g = parseInt(p.get("goal") ?? "", 10);
    if (g > 0) {
      setGoal(g);
      setGoalDraft("" + g);
    }
    setMedOutState(p.get("med") == "1");
  }, []);

  const setLook = (next: Look) => {
    setLookState(next);
    writeParams({
      tth: next.tth,
      edge: next.edge,
      band: next.band ? "1" : "0",
      fmt: next.fmt,
      controls: next.controls,
    });
  };
  const setGoalNow = (n: number) => {
    if (!(n > 0)) return;
    setGoal(n);
    setGoalDraft("" + n);
    writeParams({ goal: "" + n });
  };
  const commitDraft = () => setGoalNow(parseInt(goalDraft, 10));
  const setMedOut = (b: boolean) => {
    setMedOutState(b);
    writeParams({ med: b ? "1" : "0" });
  };

  const leftDir = useMemo(
    () => buildDirection(left, right, minFF, maxFF, goal, medOut),
    [left, right, minFF, maxFF, goal, medOut],
  );
  const rightDir = useMemo(
    () => buildDirection(right, left, minFF, maxFF, goal, medOut),
    [left, right, minFF, maxFF, goal, medOut],
  );

  return {
    look,
    setLook,
    goal,
    medOut,
    goalDraft,
    setGoalDraft,
    commitDraft,
    setGoalNow,
    setMedOut,
    left: leftDir,
    right: rightDir,
  };
}

// ---------------------------------------------------------------- controls

// The two settings as they would sit in the Change FF limits card, beside the
// three FF fields. The hit goal applies on the form's Submit like the FF
// fields; the med-out box applies at once.
export function ConfigFields({ tth }: { tth: TimeToHits }) {
  if (tth.look.controls != "config") return null;
  return (
    <>
      <div className="md:flex-1 mt-5 md:mt-0 md:mx-2.5 grid gap-2">
        <label className="text-sm font-medium leading-none" htmlFor="tth-goal">
          Hit goal
        </label>
        <Input
          id="tth-goal"
          placeholder="20"
          inputMode="numeric"
          value={tth.goalDraft}
          onChange={(e) => tth.setGoalDraft(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          Hits each attacker needs. PROTOTYPE field.
        </p>
      </div>
      <div className="md:flex-1 mt-5 md:mt-0 md:ml-2.5 grid gap-2">
        <span className="text-sm font-medium leading-none">Defenders</span>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tth.medOut}
            onChange={(e) => tth.setMedOut(e.target.checked)}
          />
          Med out of hospital
        </label>
        <p className="text-muted-foreground text-xs">
          Every defender meds out after a hit. PROTOTYPE field.
        </p>
      </div>
    </>
  );
}

// Inline controls for the strip and card placements: apply at once.
function InlineControls({
  tth,
  compact,
}: {
  tth: TimeToHits;
  compact?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-wrap items-center gap-x-4 gap-y-2 " +
        (compact ? "text-xs" : "text-sm")
      }
    >
      <label className="flex items-center gap-2">
        <span className={compact ? "" : "font-medium"}>Hit goal</span>
        <Input
          className={compact ? "h-7 w-16 text-xs" : "h-8 w-20"}
          inputMode="numeric"
          value={tth.goalDraft}
          onChange={(e) => {
            tth.setGoalDraft(e.target.value);
            const n = parseInt(e.target.value, 10);
            if (n > 0) tth.setGoalNow(n);
          }}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={tth.medOut}
          onChange={(e) => tth.setMedOut(e.target.checked)}
        />
        <span>Defenders med out</span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- shared bits

const r2 = (n: number) => Math.round(n * 100) / 100;

function devicePixel() {
  const dpr = typeof window == "undefined" ? 1 : window.devicePixelRatio || 1;
  return (n: number) => Math.round(n * dpr) / dpr;
}

function stepOf(ff: number, steps: number, minFF: number, maxFF: number) {
  const t = (ff - minFF) / (maxFF - minFF);
  return Math.min(Math.max(Math.floor(t * steps), 0), steps - 1);
}

function classPaths(
  m: Model,
  cls: Int16Array,
  classes: number,
  cw: number,
  ch: number,
): string[] {
  const parts: string[][] = Array.from({ length: classes }, () => []);
  const edge = devicePixel();
  for (let j = 0; j < m.nd; j++) {
    const y = r2(edge((m.nd - 1 - j) * ch));
    const h = r2(edge((m.nd - j) * ch) - edge((m.nd - 1 - j) * ch));
    let i = 0;
    while (i < m.na) {
      const c = cls[j * m.na + i];
      if (c < 0) {
        i++;
        continue;
      }
      let e = i;
      while (e + 1 < m.na && cls[j * m.na + e + 1] == c) e++;
      const x = r2(edge(i * cw));
      const w = r2(edge((e + 1) * cw) - edge(i * cw));
      parts[c].push(`M${x} ${y}h${w}v${h}h${-w}z`);
      i = e + 1;
    }
  }
  return parts.map((p) => p.join(""));
}

interface Cell {
  i: number;
  j: number;
}

function cellAt(e: ReactPointerEvent<Element>, cols: number, rows: number) {
  const b = e.currentTarget.getBoundingClientRect();
  const c = Math.floor(((e.clientX - b.left) / b.width) * cols);
  const r = rows - 1 - Math.floor(((e.clientY - b.top) / b.height) * rows);
  return {
    i: Math.min(Math.max(c, 0), cols - 1),
    j: Math.min(Math.max(r, 0), rows - 1),
  };
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function StateLine({ items }: { items: string[] }) {
  return (
    <div className="text-muted-foreground mt-2 font-mono text-[11px]">
      {items.join(" · ")}
    </div>
  );
}

// The tooltip's rows, also the pinned panel's. Format from issue #6, with the
// estimate as a new last row.
function CellRows({
  d,
  cell,
  colors,
  minFF,
  maxFF,
  tth,
}: {
  d: Direction;
  cell: Cell;
  colors: string[];
  minFF: number;
  maxFF: number;
  tth: TimeToHits;
}) {
  const m = d.m;
  const a = m.attackers[cell.i];
  const def = m.defenders[cell.j];
  const ff = m.ff[cell.j * m.na + cell.i];
  const isTarget = m.target[cell.j * m.na + cell.i] == 1;
  const color = isTarget
    ? colors[stepOf(ff, colors.length, minFF, maxFF)]
    : "transparent";
  const row = (label: string, value: ReactNode) => (
    <div className="flex w-full justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums text-right">
        {value}
      </span>
    </div>
  );
  return (
    <>
      <div className="flex items-center gap-1.5 font-medium">
        <span
          className="inline-block size-2.5 rounded-[2px] border"
          style={{ background: color }}
        />
        {isTarget ? "Target" : "Not a target"}
      </div>
      {row(
        "Attacker",
        <>
          <b>{a.name}</b> ({m.targetCount[cell.i]} targets)
        </>,
      )}
      {row(
        "Defender",
        <>
          <b>{def.name}</b> (shared by {m.shareCount[cell.j]})
        </>,
      )}
      {row("Fair fight", Number.isNaN(ff) ? "unknown" : ff.toFixed(2))}
      {row("Attacker estimate", a.bs_estimate_human ?? "none")}
      {row("Defender estimate", def.bs_estimate_human ?? "none")}
      <div className="border-border/50 mt-1 border-t pt-1">
        {row(
          `Time to ${tth.goal} hits`,
          estimateText(d.est[cell.i], tth.look.fmt, true),
        )}
      </div>
    </>
  );
}

function CellTooltip({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: ReactNode;
}) {
  const flipX = x > window.innerWidth - 300;
  const flipY = y > window.innerHeight - 260;
  return (
    <div
      className="border-border/50 bg-background pointer-events-none fixed z-50 grid min-w-[14rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl"
      style={{
        left: x + (flipX ? -14 : 14),
        top: y + (flipY ? -14 : 14),
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- legend

function Legend({
  d,
  colors,
  minFF,
  maxFF,
  tth,
  timeOnTop,
}: {
  d: Direction;
  colors: string[];
  minFF: number;
  maxFF: number;
  tth: TimeToHits;
  timeOnTop: boolean;
}) {
  const n = colors.length;
  const m = d.m;
  const join = tth.look.edge == "join";
  return (
    <div className="text-muted-foreground mb-3 flex flex-wrap items-start gap-x-6 gap-y-2 text-[11px]">
      <div>
        <div className="mb-1">Difficulty (fair fight)</div>
        <div className="flex h-2.5 w-44">
          {colors.map((c, k) => (
            <div key={k} style={{ background: c, width: `${100 / n}%` }} />
          ))}
        </div>
        <div className="relative h-4 w-44 font-mono tabular-nums">
          <span className="absolute left-0">{minFF}</span>
          <span className="absolute right-0">{maxFF}</span>
        </div>
        <div className="flex w-44 justify-between">
          <span>easier</span>
          <span>harder</span>
        </div>
      </div>
      <div className="max-w-sm">
        <div>Right edge: share count of each defender, up to {m.maxShare}.</div>
        {timeOnTop ? (
          <>
            {join && (
              <div>
                Top edge, lower row: target count of each attacker, up to{" "}
                {m.maxTargets}.
              </div>
            )}
            <div>
              Top edge{join ? ", upper row" : ""}: time to {tth.goal} hits for
              each attacker, up to {fmtMinutes(d.maxTime, tth.look.fmt)}
              {tth.look.band ? "; the dark part is the 10th-90th band" : ""}.
              Hatched: never (no targets).
            </div>
          </>
        ) : (
          <div>
            Top edge: target count of each attacker, up to {m.maxTargets}.
          </div>
        )}
        <div>
          Hospital stays of 15-30 min, defenders{" "}
          {tth.medOut ? "med out" : "serve their stay"}.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- heatmap

function Heatmap({
  d,
  colors,
  minFF,
  maxFF,
  tth,
  pinned,
  onPin,
}: {
  d: Direction;
  colors: string[];
  minFF: number;
  maxFF: number;
  tth: TimeToHits;
  pinned: Cell | null;
  onPin: (c: Cell) => void;
}) {
  const m = d.m;
  const look = tth.look;
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<(Cell & { x: number; y: number }) | null>(
    null,
  );

  const timeOnTop = look.tth == "A";
  const join = timeOnTop && look.edge == "join";

  const narrow = width < 480;
  const GAP = 4;
  const LABEL = 22;
  const markR = narrow ? 22 : 34;
  const markT = 28;
  const ROWGAP = 6; // between the two top rows when joined
  const topRows = join ? 2 : 1;
  const ML = narrow ? 72 : 96;
  const MB = narrow ? 72 : 90;
  const MR = 6 + GAP + markR + LABEL;
  const MT = 6 + GAP + markT * topRows + (join ? ROWGAP : 0) + 12;
  const avail = Math.max(width - ML - MR, 50);

  const cw = avail / m.na;
  const ch = 500 / m.nd;
  const pw = cw * m.na;
  const ph = ch * m.nd;
  const stepY = Math.max(Math.ceil(12 / ch), 1);
  const stepX = Math.max(Math.ceil(15 / cw), 1);
  const steps = colors.length;

  const paths = useMemo(() => {
    const cls = new Int16Array(m.na * m.nd).fill(-1);
    for (let j = 0; j < m.nd; j++) {
      for (let i = 0; i < m.na; i++) {
        const k = j * m.na + i;
        if (!m.target[k]) continue;
        cls[k] = stepOf(m.ff[k], steps, minFF, maxFF);
      }
    }
    return classPaths(m, cls, steps, cw, ch);
  }, [m, cw, ch, steps, minFF, maxFF]);

  // edge marks: share count on the right; target count and/or time on top
  const marks = useMemo(() => {
    const edge = devicePixel();
    let right = "";
    let targets = "";
    let median = ""; // median bar
    let band = ""; // p10-p90 segment, drawn over the median bar
    let never = ""; // full-height hatched bar
    for (let j = 0; j < m.nd; j++) {
      const count = m.shareCount[j];
      if (count == 0) continue;
      const y = r2(edge((m.nd - 1 - j) * ch));
      const h = r2(edge((m.nd - j) * ch) - edge((m.nd - 1 - j) * ch));
      const len = r2(Math.max((count / m.maxShare) * markR, 1));
      right += `M0 ${y}h${len}v${h}h${-len}z`;
    }
    const scaleT = (min: number) => r2(Math.max((min / d.maxTime) * markT, 1));
    for (let i = 0; i < m.na; i++) {
      const x = r2(edge(i * cw));
      const w = r2(edge((i + 1) * cw) - edge(i * cw));
      if (m.targetCount[i] > 0) {
        const len = r2(Math.max((m.targetCount[i] / m.maxTargets) * markT, 1));
        targets += `M${x} 0h${w}v${-len}h${-w}z`;
      }
      const e = d.est[i];
      if (e.kind == "time") {
        median += `M${x} 0h${w}v${-scaleT(e.p50)}h${-w}z`;
        const lo = scaleT(e.p10);
        const hi = scaleT(e.p90);
        band += `M${x} ${-lo}h${w}v${-(hi - lo)}h${-w}z`;
      } else if (e.kind == "never") {
        never += `M${x} 0h${w}v${-markT}h${-w}z`;
      }
    }
    return { right, targets, median, band, never };
  }, [m, d, cw, ch, markR, markT]);

  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const c = cellAt(e, m.na, m.nd);
    setHover({ ...c, x: e.clientX, y: e.clientY });
  };

  const guides = [];
  for (let i = 10; i < m.na; i += 10) {
    guides.push(
      <line key={"x" + i} x1={i * cw} x2={i * cw} y1={0} y2={ph} />,
    );
  }
  for (let j = 10; j < m.nd; j += 10) {
    guides.push(
      <line
        key={"y" + j}
        x1={0}
        x2={pw}
        y1={(m.nd - j) * ch}
        y2={(m.nd - j) * ch}
      />,
    );
  }

  // where the time row sits: the only row when replacing, the upper when joined
  const timeRowY = join ? -(GAP + markT + ROWGAP) : -GAP;
  const targetRowY = -GAP;

  const hoverTop = (() => {
    if (!hover) return null;
    const i = hover.i;
    const x = Math.min(Math.max(i * cw + cw / 2, 8), pw - 8);
    const out: ReactNode[] = [];
    const show = (y: number, text: string, key: string) =>
      out.push(
        <text
          key={key}
          x={x}
          y={y}
          textAnchor="middle"
          className="font-mono"
        >
          {text}
        </text>,
      );
    if (!timeOnTop || join) {
      const len = (m.targetCount[i] / m.maxTargets) * markT;
      show(targetRowY - len - 3, "" + m.targetCount[i], "t");
    }
    if (timeOnTop) {
      const e = d.est[i];
      const len =
        e.kind == "time"
          ? (e.p90 / d.maxTime) * markT
          : e.kind == "never"
            ? markT
            : 0;
      show(
        timeRowY - len - 3,
        e.kind == "time"
          ? fmtMinutes(e.p50, look.fmt)
          : e.kind == "never"
            ? "never"
            : "",
        "e",
      );
    }
    return out;
  })();

  const hoverShareLen = hover
    ? (m.shareCount[hover.j] / m.maxShare) * markR
    : 0;

  return (
    <div ref={ref} className="w-full">
      <Legend
        d={d}
        colors={colors}
        minFF={minFF}
        maxFF={maxFF}
        tth={tth}
        timeOnTop={timeOnTop}
      />
      {width > 0 && (
        <svg
          width={width}
          height={MT + ph + MB}
          className="text-muted-foreground block select-none"
          style={{ fontSize: narrow ? 9 : 10 }}
        >
          <defs>
            <pattern
              id="tth-hatch"
              width={4}
              height={4}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width={1.5} height={4} fill="currentColor" />
            </pattern>
          </defs>
          <g transform={`translate(${ML},${MT})`}>
            <g stroke="currentColor" strokeOpacity={0.18}>
              {guides}
            </g>
            {paths.map((p, c) =>
              p ? (
                <path
                  key={c}
                  d={p}
                  fill={colors[c]}
                  shapeRendering="crispEdges"
                />
              ) : null,
            )}
            <g
              transform={`translate(${pw + GAP},0)`}
              fill="currentColor"
              shapeRendering="crispEdges"
            >
              <path d={marks.right} fillOpacity={0.55} />
            </g>
            {(!timeOnTop || join) && (
              <g
                transform={`translate(0,${targetRowY})`}
                fill="currentColor"
                shapeRendering="crispEdges"
              >
                <path d={marks.targets} fillOpacity={0.55} />
              </g>
            )}
            {timeOnTop && (
              <g transform={`translate(0,${timeRowY})`} shapeRendering="crispEdges">
                <path d={marks.median} fill="currentColor" fillOpacity={0.4} />
                {look.band && (
                  <path d={marks.band} fill="currentColor" fillOpacity={0.9} />
                )}
                {!look.band && (
                  <path d={marks.median} fill="currentColor" fillOpacity={0.3} />
                )}
                <path
                  d={marks.never}
                  fill="url(#tth-hatch)"
                  className="text-destructive"
                />
              </g>
            )}
            {join && (
              <line
                x1={0}
                x2={pw}
                y1={-(GAP + markT + ROWGAP / 2)}
                y2={-(GAP + markT + ROWGAP / 2)}
                stroke="currentColor"
                strokeOpacity={0.25}
              />
            )}
            {pinned && (
              <g
                fill="none"
                className="stroke-foreground"
                strokeWidth={1.5}
              >
                <rect
                  x={pinned.i * cw - 1}
                  y={-1}
                  width={cw + 2}
                  height={ph + 2}
                  strokeDasharray="3 2"
                />
                <rect
                  x={-1}
                  y={(m.nd - 1 - pinned.j) * ch - 1}
                  width={pw + 2}
                  height={ch + 2}
                  strokeDasharray="3 2"
                />
              </g>
            )}
            {hover && (
              <g fill="currentColor" fillOpacity={0.16}>
                <rect
                  x={0}
                  y={(m.nd - 1 - hover.j) * ch}
                  width={pw}
                  height={ch}
                />
                <rect x={hover.i * cw} y={0} width={cw} height={ph} />
              </g>
            )}
            <rect
              width={pw}
              height={ph}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.4}
            />
            <g fill="currentColor" opacity={hover ? 0.3 : 1}>
              {m.defenders.map((def, j) =>
                j % stepY == 0 ? (
                  <text
                    key={def.id}
                    x={-6}
                    y={(m.nd - 1 - j) * ch + ch / 2}
                    textAnchor="end"
                    dominantBaseline="central"
                  >
                    {def.name}
                  </text>
                ) : null,
              )}
              {m.attackers.map((a, i) =>
                i % stepX == 0 ? (
                  <text
                    key={a.id}
                    transform={`translate(${i * cw + cw / 2},${ph + 8}) rotate(-45)`}
                    textAnchor="end"
                    dominantBaseline="central"
                  >
                    {a.name}
                  </text>
                ) : null,
              )}
            </g>
            {hover && (
              <g className="fill-foreground" fontWeight={700}>
                <text
                  x={-6}
                  y={(m.nd - 1 - hover.j) * ch + ch / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                >
                  {m.defenders[hover.j].name}
                </text>
                <text
                  transform={`translate(${hover.i * cw + cw / 2},${ph + 8}) rotate(-45)`}
                  textAnchor="end"
                  dominantBaseline="central"
                >
                  {m.attackers[hover.i].name}
                </text>
                <text
                  x={pw + GAP + hoverShareLen + 3}
                  y={(m.nd - 1 - hover.j) * ch + ch / 2}
                  dominantBaseline="central"
                  className="font-mono"
                >
                  {m.shareCount[hover.j]}
                </text>
                {hoverTop}
              </g>
            )}
            <rect
              width={pw}
              height={ph}
              fill="transparent"
              style={{ cursor: "pointer", touchAction: "pan-y" }}
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={(e) => {
                if (e.pointerType == "mouse") setHover(null);
              }}
              onClick={() => hover && onPin({ i: hover.i, j: hover.j })}
            />
          </g>
        </svg>
      )}
      {hover && (
        <CellTooltip x={hover.x} y={hover.y}>
          <CellRows
            d={d}
            cell={hover}
            colors={colors}
            minFF={minFF}
            maxFF={maxFF}
            tth={tth}
          />
        </CellTooltip>
      )}
    </div>
  );
}

// The pinned cell's panel below the plot (issues #6 and #7), reduced to its
// fields and a close button. The step buttons are not part of this question.
function PinnedPanel({
  d,
  cell,
  colors,
  minFF,
  maxFF,
  tth,
  onClose,
}: {
  d: Direction;
  cell: Cell;
  colors: string[];
  minFF: number;
  maxFF: number;
  tth: TimeToHits;
  onClose: () => void;
}) {
  return (
    <div className="border-border/50 relative mt-3 grid max-w-sm gap-1.5 rounded-lg border px-3 py-2 text-xs">
      <button
        className="text-muted-foreground hover:text-foreground absolute top-1.5 right-2"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>
      <CellRows
        d={d}
        cell={cell}
        colors={colors}
        minFF={minFF}
        maxFF={maxFF}
        tth={tth}
      />
    </div>
  );
}

// ---------------------------------------------------------------- variant B

const ROW_H = 14;
const LIST_H = 500;

function RankedChart({
  d,
  tth,
  onSelect,
}: {
  d: Direction;
  tth: TimeToHits;
  onSelect: (attacker: GraphData) => void;
}) {
  const m = d.m;
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const fmt = tth.look.fmt;

  // never first, then timed by median descending, then blank
  const order = useMemo(() => {
    const idx = m.attackers.map((_, i) => i);
    const rank = (i: number) => {
      const e = d.est[i];
      return e.kind == "never" ? 2 : e.kind == "time" ? 1 : 0;
    };
    idx.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra != rb) return rb - ra;
      const ea = d.est[a];
      const eb = d.est[b];
      if (ea.kind == "time" && eb.kind == "time") return eb.p50 - ea.p50;
      return a - b;
    });
    return idx;
  }, [m, d]);

  const narrow = width < 480;
  const ML = narrow ? 80 : 110;
  const MR = narrow ? 56 : 72; // room for the figure beside the longest whisker
  const MT = 18;
  const pw = Math.max(width - ML - MR, 50);
  const x = (min: number) => (min / d.maxTime) * pw;
  const height = MT + order.length * ROW_H + 4;

  // tick every whole hour, thinned so ticks are at least 50 px apart
  const ticks: number[] = [];
  const hours = d.maxTime / 60;
  const every = Math.max(1, Math.ceil((50 / pw) * hours));
  for (let h = 0; h <= hours; h += every) ticks.push(h * 60);

  return (
    <div ref={ref} className="w-full">
      <div
        className="text-muted-foreground mb-2 text-[11px]"
      >
        Each attacker&apos;s waiting time to reach {tth.goal} hits, most
        squeezed first. Dot: median; {tth.look.band ? "line: 10th-90th band; " : ""}
        hospital stays of 15-30 min, defenders{" "}
        {tth.medOut ? "med out" : "serve their stay"}.
      </div>
      {width > 0 && (
        <div
          className="overflow-y-auto"
          style={{ maxHeight: LIST_H }}
          onPointerLeave={() => setHover(null)}
        >
          <svg
            width={width}
            height={height}
            className="text-muted-foreground block select-none"
            style={{ fontSize: narrow ? 9 : 10 }}
          >
            <g transform={`translate(${ML},0)`}>
              <g stroke="currentColor" strokeOpacity={0.18}>
                {ticks.map((t) => (
                  <line key={t} x1={x(t)} x2={x(t)} y1={MT} y2={height} />
                ))}
              </g>
              <g fill="currentColor" className="font-mono">
                {ticks.map((t) => (
                  <text key={t} x={x(t)} y={10} textAnchor="middle">
                    {fmtMinutes(t, fmt)}
                  </text>
                ))}
              </g>
              {order.map((i, r) => {
                const e = d.est[i];
                const a = m.attackers[i];
                const cy = MT + r * ROW_H + ROW_H / 2;
                const hot = hover == i;
                return (
                  <g
                    key={a.id}
                    onPointerEnter={() => setHover(i)}
                    onClick={() => onSelect(a)}
                    style={{ cursor: "pointer" }}
                  >
                    <rect
                      x={-ML}
                      y={cy - ROW_H / 2}
                      width={ML + pw + MR}
                      height={ROW_H}
                      fill="currentColor"
                      fillOpacity={hot ? 0.12 : 0}
                    />
                    <text
                      x={-6}
                      y={cy}
                      textAnchor="end"
                      dominantBaseline="central"
                      className={hot ? "fill-foreground" : ""}
                      fontWeight={hot ? 700 : 400}
                    >
                      {a.name}
                    </text>
                    {e.kind == "time" && (
                      <>
                        {tth.look.band && (
                          <line
                            x1={x(e.p10)}
                            x2={x(e.p90)}
                            y1={cy}
                            y2={cy}
                            stroke="currentColor"
                            strokeOpacity={0.6}
                            strokeWidth={2}
                          />
                        )}
                        <circle
                          cx={x(e.p50)}
                          cy={cy}
                          r={3}
                          className="fill-foreground"
                        />
                        {hot && (
                          <text
                            x={x(tth.look.band ? e.p90 : e.p50) + 6}
                            y={cy}
                            dominantBaseline="central"
                            className="fill-foreground font-mono"
                            fontWeight={700}
                          >
                            {estimateText(e, fmt, tth.look.band)}
                          </text>
                        )}
                      </>
                    )}
                    {e.kind == "never" && (
                      <text
                        x={0}
                        y={cy}
                        dominantBaseline="central"
                        className="fill-destructive"
                        fontStyle="italic"
                      >
                        never (no targets)
                      </text>
                    )}
                    {e.kind == "blank" && (
                      <text
                        x={0}
                        y={cy}
                        dominantBaseline="central"
                        fillOpacity={0.6}
                        fontStyle="italic"
                      >
                        no estimate
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      )}
      <StateLine
        items={[
          `${order.length} attackers`,
          `${d.est.filter((e) => e.kind == "never").length} never`,
          `${d.est.filter((e) => e.kind == "blank").length} blank`,
          `longest band ${fmtMinutes(d.maxTime, fmt)}`,
          `${height > LIST_H ? "scrolls" : "fits"}`,
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------- variant C

// A column for the Data tab's faction tables.
export function timeToHitsColumn(
  tth: TimeToHits,
  side: "left" | "right",
): ColumnDef<GraphData>[] {
  if (tth.look.tth != "C") return [];
  const d = side == "left" ? tth.left : tth.right;
  return [
    {
      id: "tth",
      header: `Time to ${tth.goal} hits`,
      cell: ({ row }) => {
        const e = d.byId.get(row.original.id);
        const text = estimateText(e, tth.look.fmt, tth.look.band);
        return (
          <span
            className={
              "tabular-nums whitespace-nowrap " +
              (e?.kind == "never"
                ? "text-destructive italic"
                : e?.kind == "blank"
                  ? "text-muted-foreground italic"
                  : "")
            }
          >
            {text}
          </span>
        );
      },
    },
  ];
}

// ---------------------------------------------------------------- switcher

function cycle<T extends string>(list: readonly T[], v: T, by: number): T {
  const i = list.indexOf(v);
  return list[(i + by + list.length) % list.length];
}

function PrototypeSwitcher({ tth }: { tth: TimeToHits }) {
  const { look, setLook } = tth;
  const keys = VARIANTS.map((v) => v.key);
  const variant = (by: number) =>
    setLook({ ...look, tth: cycle(keys, look.tth, by) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input, textarea, [contenteditable]")) return;
      if (e.key == "ArrowLeft") variant(-1);
      if (e.key == "ArrowRight") variant(1);
      if (e.key == "e") setLook({ ...look, edge: cycle(EDGES, look.edge, 1) });
      if (e.key == "b") setLook({ ...look, band: !look.band });
      if (e.key == "f") setLook({ ...look, fmt: cycle(FMTS, look.fmt, 1) });
      if (e.key == "k")
        setLook({ ...look, controls: cycle(CONTROLS, look.controls, 1) });
      if (e.key == "d") tth.setMedOut(!tth.medOut);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV == "production") return null;
  const name = VARIANTS.find((v) => v.key == look.tth)!.name;
  const toggle = (on: boolean) =>
    "rounded-full px-2 py-0.5 " +
    (on ? "bg-yellow-400 text-black" : "bg-white/15");
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-2xl bg-black px-4 py-2 text-xs text-white shadow-2xl ring-2 ring-yellow-400">
      <span className="flex items-center gap-2 whitespace-nowrap">
        <button onClick={() => variant(-1)} aria-label="Previous variant">
          ←
        </button>
        <span>
          <b>{look.tth}</b> ({name})
        </span>
        <button onClick={() => variant(1)} aria-label="Next variant">
          →
        </button>
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {look.tth == "A" && (
          <button
            className={toggle(look.edge == "join")}
            onClick={() =>
              setLook({ ...look, edge: cycle(EDGES, look.edge, 1) })
            }
          >
            e: {look.edge == "join" ? "joins target bars" : "replaces target bars"}
          </button>
        )}
        <button
          className={toggle(look.band)}
          onClick={() => setLook({ ...look, band: !look.band })}
        >
          b: band {look.band ? "shown" : "tooltip only"}
        </button>
        <button
          className={toggle(false)}
          onClick={() => setLook({ ...look, fmt: cycle(FMTS, look.fmt, 1) })}
        >
          f: {fmtMinutes(320, look.fmt)}
        </button>
        <button
          className={toggle(false)}
          onClick={() =>
            setLook({ ...look, controls: cycle(CONTROLS, look.controls, 1) })
          }
        >
          k: controls in {look.controls}
        </button>
        <button
          className={toggle(tth.medOut)}
          onClick={() => tth.setMedOut(!tth.medOut)}
        >
          d: med out {tth.medOut ? "on" : "off"}
        </button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- mount

function DirectionCards({
  d,
  tth,
  colors,
  minFF,
  maxFF,
  attackerFaction,
  defenderFaction,
  onSelect,
  heatmapOrder,
  chartOrder,
}: {
  d: Direction;
  tth: TimeToHits;
  colors: string[];
  minFF: number;
  maxFF: number;
  attackerFaction: string;
  defenderFaction: string;
  onSelect: (attacker: GraphData) => void;
  heatmapOrder: string;
  chartOrder: string;
}) {
  const [pinned, setPinned] = useState<Cell | null>(null);
  const [selected, setSelected] = useState("");
  const select = (a: GraphData) => {
    setSelected(a.name);
    onSelect(a);
  };
  // the pin holds its members, not its position
  const pinCell =
    pinned && pinned.i < d.m.na && pinned.j < d.m.nd ? pinned : null;
  return (
    <>
      <Card className={"col-span-2 lg:col-span-1 " + heatmapOrder}>
        <CardHeader>
          <CardTitle>Targets for {attackerFaction}</CardTitle>
          <CardDescription>
            {attackerFaction} attackers along the bottom, {defenderFaction}{" "}
            defenders up the side, weakest to strongest. Fair fight {minFF} to{" "}
            {maxFF}.
          </CardDescription>
          {tth.look.controls == "card" && (
            <div className="pt-2">
              <InlineControls tth={tth} compact />
            </div>
          )}
        </CardHeader>
        <CardContent>
          <Heatmap
            d={d}
            colors={colors}
            minFF={minFF}
            maxFF={maxFF}
            tth={tth}
            pinned={pinCell}
            onPin={(c) => {
              setPinned(c);
              select(d.m.attackers[c.i]);
            }}
          />
          {pinCell && (
            <PinnedPanel
              d={d}
              cell={pinCell}
              colors={colors}
              minFF={minFF}
              maxFF={maxFF}
              tth={tth}
              onClose={() => setPinned(null)}
            />
          )}
          <StateLine
            items={[
              `${d.m.na} attackers x ${d.m.nd} defenders`,
              `${d.m.total} targets`,
              `sim ${d.simMs.toFixed(0)} ms`,
              `longest p90 ${fmtMinutes(d.maxTime, tth.look.fmt)}`,
              selected ? `selected attacker: ${selected}` : "nothing selected",
            ]}
          />
        </CardContent>
      </Card>
      {tth.look.tth == "B" && (
        <Card className={"col-span-2 lg:col-span-1 " + chartOrder}>
          <CardHeader>
            <CardTitle>
              Time to {tth.goal} hits for {attackerFaction}
            </CardTitle>
            <CardDescription>
              How long each {attackerFaction} attacker waits for a free target
              against {defenderFaction}. Click a row to select the attacker.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RankedChart d={d} tth={tth} onSelect={select} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

export function TimeToHitsPrototype({
  tth,
  leftName,
  rightName,
  minFF,
  maxFF,
  onSelectLeft,
  onSelectRight,
}: {
  tth: TimeToHits;
  leftName: string;
  rightName: string;
  minFF: number;
  maxFF: number;
  onSelectLeft: (attacker: GraphData) => void;
  onSelectRight: (attacker: GraphData) => void;
}) {
  const { resolvedTheme } = useTheme();
  const colors = resolvedTheme == "dark" ? HEAT_DARK : HEAT_LIGHT;
  const look = tth.look;
  return (
    <>
      <div className="text-muted-foreground col-span-2 rounded-md border border-dashed p-2 font-mono text-[11px]">
        PROTOTYPE · time to hits {look.tth}:{" "}
        {VARIANTS.find((v) => v.key == look.tth)!.name}
        {look.tth == "A" ? ` (${look.edge}s target bars)` : ""} · band{" "}
        {look.band ? "shown" : "tooltip only"} · format {look.fmt} · controls in{" "}
        {look.controls} · hit goal {tth.goal} · med out{" "}
        {tth.medOut ? "on" : "off"}
        {look.tth == "C" ? " · see the Data tab for the column" : ""}
      </div>
      {look.controls == "strip" && (
        <div className="col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border px-3 py-2">
          <span className="text-sm font-medium">Time to hits</span>
          <InlineControls tth={tth} />
        </div>
      )}
      <DirectionCards
        d={tth.left}
        tth={tth}
        colors={colors}
        minFF={minFF}
        maxFF={maxFF}
        attackerFaction={leftName}
        defenderFaction={rightName}
        onSelect={onSelectLeft}
        heatmapOrder="order-1"
        chartOrder="order-2 lg:order-3"
      />
      <DirectionCards
        d={tth.right}
        tth={tth}
        colors={colors}
        minFF={minFF}
        maxFF={maxFF}
        attackerFaction={rightName}
        defenderFaction={leftName}
        onSelect={onSelectRight}
        heatmapOrder="order-3 lg:order-2"
        chartOrder="order-4"
      />
      {/* room for the switcher bar */}
      <div className="col-span-2 order-last h-20" />
      <PrototypeSwitcher tth={tth} />
    </>
  );
}
