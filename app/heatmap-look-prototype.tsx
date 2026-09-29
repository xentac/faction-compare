"use client";
// PROTOTYPE, throwaway. Do not ship.
//
// Question (issue #5): how should a target's difficulty and its share count
// be shown on the target heatmap?
//
// Five difficulty colourings and four share count displays, switchable
// independently on the stretched layout settled in issue #4, mounted on the
// existing Faction Charts tab below the existing charts:
//
//   ?colour=A|B|C|D|E   the difficulty colours
//   ?share=1|2|3|4      where the share count is shown
//   ?reverse=1          flip which end of the ramp is the hard end
//   ?targets=0          hide each attacker's target count
//   ?cvd=deutan|protan|tritan   simulate colour blindness

import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GraphData } from "./types";

// ---------------------------------------------------------------- options

// Colours run from the easiest target to the hardest. Each theme has its own
// steps: by default the hard end is the one furthest from the card surface.
interface Scheme {
  key: string;
  name: string;
  split: "even" | "easy"; // even steps across the target range, or at Easy FF Max
  light: string[];
  dark: string[];
  note: string;
}

const SCHEMES: Scheme[] = [
  {
    key: "A",
    name: "Blue, 10 steps",
    split: "even",
    light: [
      "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf",
      "#1c5cab", "#184f95", "#104281", "#0d366b",
    ],
    dark: [
      "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7",
      "#6da7ec", "#86b6ef", "#9ec5f4", "#b7d3f6",
    ],
    note: "one hue, reads as continuous; neighbouring steps are too close to tell apart by eye (lightness gap 0.047, want 0.06)",
  },
  {
    key: "B",
    name: "Blue, 4 steps",
    split: "even",
    light: ["#86b6ef", "#3987e5", "#1c5cab", "#0d366b"],
    dark: ["#184f95", "#2a78d6", "#6da7ec", "#b7d3f6"],
    note: "one hue, every step distinct; passes every ramp check in both themes",
  },
  {
    key: "C",
    name: "Easy and possible, the existing chart colours",
    split: "easy",
    light: ["#226600", "#aab000"],
    dark: ["#226600", "#aab000"],
    note: "two steps split at Easy FF Max; same colours in both themes, as the existing charts",
  },
  {
    key: "D",
    name: "Heat, yellow to dark red",
    split: "even",
    light: ["#fd8d3c", "#fc4e2a", "#e31a1c", "#bd0026", "#800026"],
    dark: ["#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#bd0026"],
    note: "several hues; red is the hard end in both themes, so in the dark theme the hard end sits nearest the surface; orange is also the existing Impossible colour",
  },
  {
    key: "E",
    name: "Viridis, green to purple",
    split: "even",
    light: [
      "#44bf70", "#22a884", "#21918c", "#2a788e", "#355f8d", "#414487",
      "#482475", "#440154",
    ],
    dark: [
      "#414487", "#355f8d", "#2a788e", "#21918c", "#22a884", "#44bf70",
      "#7ad151", "#bddf26", "#fde725",
    ],
    note: "several hues, built for colour-blind viewers; hue order flips between themes",
  },
];

const SHARES = [
  { key: "1", name: "Hover only" },
  { key: "2", name: "Bars in the margins" },
  { key: "3", name: "Shaded strips in the margins" },
  { key: "4", name: "Fade inside the cell" },
];

const CVDS = ["none", "deutan", "protan", "tritan"];

interface Look {
  colour: string;
  share: string;
  reverse: boolean;
  targets: boolean;
  cvd: string;
}

const DEFAULT_LOOK: Look = {
  colour: "A",
  share: "1",
  reverse: false,
  targets: true,
  cvd: "none",
};

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

const r2 = (n: number) => Math.round(n * 100) / 100;

function devicePixel() {
  const dpr = typeof window == "undefined" ? 1 : window.devicePixelRatio || 1;
  return (n: number) => Math.round(n * dpr) / dpr;
}

// The difficulty step of a fair fight inside the target range.
function stepOf(
  ff: number,
  scheme: Scheme,
  steps: number,
  minFF: number,
  easyFF: number,
  maxFF: number,
): number {
  if (scheme.split == "easy") return ff <= easyFF ? 0 : 1;
  const t = (ff - minFF) / (maxFF - minFF);
  return Math.min(Math.max(Math.floor(t * steps), 0), steps - 1);
}

// Share count in three bands of the highest share count: 0 low, 1 mid, 2 high.
function shareBand(count: number, max: number): number {
  return Math.min(Math.floor(((count - 1) / max) * 3), 2);
}
const BAND_OPACITY = [1, 0.6, 0.3];

// One path per class. Every cell edge sits on a whole device pixel, and
// neighbouring cells of one class in a row merge into one rectangle.
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

// ---------------------------------------------------------------- shared bits

interface Hover {
  i: number;
  j: number;
  x: number;
  y: number;
}

function cellAt(
  e: ReactPointerEvent<Element>,
  cols: number,
  rows: number,
): { c: number; r: number } {
  const b = e.currentTarget.getBoundingClientRect();
  const c = Math.floor(((e.clientX - b.left) / b.width) * cols);
  const r = rows - 1 - Math.floor(((e.clientY - b.top) / b.height) * rows);
  return {
    c: Math.min(Math.max(c, 0), cols - 1),
    r: Math.min(Math.max(r, 0), rows - 1),
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

interface Scale {
  scheme: Scheme;
  colors: string[]; // easiest to hardest, for the current theme and direction
  minFF: number;
  easyFF: number;
  maxFF: number;
}

function CellTooltip({
  m,
  hover,
  scale,
  look,
}: {
  m: Model;
  hover: Hover;
  scale: Scale;
  look: Look;
}) {
  const a = m.attackers[hover.i];
  const d = m.defenders[hover.j];
  const ff = m.ff[hover.j * m.na + hover.i];
  const isTarget = m.target[hover.j * m.na + hover.i] == 1;
  const flipX = hover.x > window.innerWidth - 260;
  const flipY = hover.y > window.innerHeight - 200;
  const color = isTarget
    ? scale.colors[
        stepOf(
          ff,
          scale.scheme,
          scale.colors.length,
          scale.minFF,
          scale.easyFF,
          scale.maxFF,
        )
      ]
    : "transparent";
  const row = (label: string, value: string) => (
    <div className="flex w-full justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums">{value}</span>
    </div>
  );
  return (
    <div
      className="border-border/50 bg-background pointer-events-none fixed z-50 grid min-w-[12rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl"
      style={{
        left: hover.x + (flipX ? -14 : 14),
        top: hover.y + (flipY ? -14 : 14),
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
      }}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <span
          className="inline-block size-2.5 rounded-[2px] border"
          style={{ background: color }}
        />
        {isTarget ? "Target" : "Not a target"}
      </div>
      {row("Attacker", a.name)}
      {row("Defender", d.name)}
      {row("Fair fight", Number.isNaN(ff) ? "unknown" : ff.toFixed(2))}
      {row("Attacker estimate", a.bs_estimate_human ?? "none")}
      {row("Defender estimate", d.bs_estimate_human ?? "none")}
      {row("Share count", "" + m.shareCount[hover.j])}
      {look.targets && row("Attacker's targets", "" + m.targetCount[hover.i])}
    </div>
  );
}

function Legend({ m, scale, look }: { m: Model; scale: Scale; look: Look }) {
  const n = scale.colors.length;
  const easyAt =
    scale.scheme.split == "easy"
      ? 50
      : ((scale.easyFF - scale.minFF) / (scale.maxFF - scale.minFF)) * 100;
  const third = (k: number) => Math.floor((m.maxShare * k) / 3);
  return (
    <div className="text-muted-foreground mb-3 flex flex-wrap items-start gap-x-6 gap-y-2 text-[11px]">
      <div>
        <div className="mb-1">Difficulty (fair fight)</div>
        <div className="flex h-2.5 w-44">
          {scale.colors.map((c, k) => (
            <div key={k} style={{ background: c, width: `${100 / n}%` }} />
          ))}
        </div>
        <div className="relative h-4 w-44 font-mono tabular-nums">
          <span className="absolute left-0">{scale.minFF}</span>
          {scale.scheme.split == "easy" && (
            <span
              className="absolute -translate-x-1/2"
              style={{ left: `${easyAt}%` }}
            >
              {scale.easyFF}
            </span>
          )}
          <span className="absolute right-0">{scale.maxFF}</span>
        </div>
        <div className="flex w-44 justify-between">
          <span>easier</span>
          <span>harder</span>
        </div>
      </div>
      {look.share == "4" && (
        <div>
          <div className="mb-1">Share count (fade)</div>
          <div className="flex items-center gap-3">
            {BAND_OPACITY.map((o, b) => (
              <span key={b} className="flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-4"
                  style={{
                    background: scale.colors[n - 1],
                    opacity: o,
                  }}
                />
                <span className="font-mono tabular-nums">
                  {b == 0
                    ? `1-${third(1)}`
                    : b == 1
                      ? `${third(1) + 1}-${third(2)}`
                      : `${third(2) + 1}-${m.maxShare}`}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
      {(look.share == "2" || look.share == "3") && (
        <div className="max-w-xs">
          <div>
            Right edge: share count of each defender, up to {m.maxShare}.
          </div>
          {look.targets && (
            <div>
              Top edge: target count of each attacker, up to {m.maxTargets}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- heatmap

const STRIP_STEPS = 5;
const STRIP_OPACITY = [0.14, 0.3, 0.48, 0.68, 0.9];

function LookHeatmap({
  m,
  scale,
  look,
  onSelect,
}: {
  m: Model;
  scale: Scale;
  look: Look;
  onSelect: (attacker: GraphData) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);

  const bars = look.share == "2";
  const strips = look.share == "3";
  const margins = bars || strips;
  const showTop = margins && look.targets;

  const narrow = width < 480;
  const GAP = 4;
  const LABEL = 22; // room for the hovered count beside a bar or strip
  const markR = bars ? (narrow ? 22 : 34) : strips ? 10 : 0; // longest mark
  const markT = bars ? 28 : strips ? 10 : 0;
  const ML = narrow ? 72 : 96;
  const MB = narrow ? 72 : 90;
  const MR = 6 + (margins ? GAP + markR + LABEL : 0);
  const MT = 6 + (showTop ? GAP + markT + 12 : 0);
  const avail = Math.max(width - ML - MR, 50);

  const cw = avail / m.na;
  const ch = 500 / m.nd;
  const pw = cw * m.na;
  const ph = ch * m.nd;
  const stepY = Math.max(Math.ceil(12 / ch), 1);
  const stepX = Math.max(Math.ceil(15 / cw), 1);

  const steps = scale.colors.length;
  const fade = look.share == "4";

  const paths = useMemo(() => {
    const cls = new Int16Array(m.na * m.nd).fill(-1);
    for (let j = 0; j < m.nd; j++) {
      const band = fade ? shareBand(m.shareCount[j], m.maxShare) : 0;
      for (let i = 0; i < m.na; i++) {
        const k = j * m.na + i;
        if (!m.target[k]) continue;
        const s = stepOf(
          m.ff[k],
          scale.scheme,
          steps,
          scale.minFF,
          scale.easyFF,
          scale.maxFF,
        );
        cls[k] = s * 3 + band;
      }
    }
    return classPaths(m, cls, steps * 3, cw, ch);
  }, [m, cw, ch, steps, fade, scale.scheme, scale.minFF, scale.easyFF, scale.maxFF]);

  // margin marks: share count per defender on the right, target count per
  // attacker along the top
  const marks = useMemo(() => {
    if (!margins) return null;
    const edge = devicePixel();
    const right: string[] = Array.from({ length: STRIP_STEPS }, () => "");
    const top: string[] = Array.from({ length: STRIP_STEPS }, () => "");
    const level = (count: number, max: number) =>
      Math.min(Math.floor(((count - 1) / max) * STRIP_STEPS), STRIP_STEPS - 1);
    for (let j = 0; j < m.nd; j++) {
      const count = m.shareCount[j];
      if (count == 0) continue;
      const y = r2(edge((m.nd - 1 - j) * ch));
      const h = r2(edge((m.nd - j) * ch) - edge((m.nd - 1 - j) * ch));
      const len = bars ? r2(Math.max((count / m.maxShare) * markR, 1)) : markR;
      const k = bars ? 0 : level(count, m.maxShare);
      right[k] += `M0 ${y}h${len}v${h}h${-len}z`;
    }
    for (let i = 0; i < m.na; i++) {
      const count = m.targetCount[i];
      if (count == 0) continue;
      const x = r2(edge(i * cw));
      const w = r2(edge((i + 1) * cw) - edge(i * cw));
      const len = bars
        ? r2(Math.max((count / m.maxTargets) * markT, 1))
        : markT;
      const k = bars ? 0 : level(count, m.maxTargets);
      top[k] += `M${x} 0h${w}v${-len}h${-w}z`;
    }
    return { right, top };
  }, [m, margins, bars, cw, ch, markR, markT]);

  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const { c, r } = cellAt(e, m.na, m.nd);
    setHover({ i: c, j: r, x: e.clientX, y: e.clientY });
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

  const hoverShareLen =
    hover && bars
      ? (m.shareCount[hover.j] / m.maxShare) * markR
      : markR;
  const hoverTargetLen =
    hover && bars
      ? (m.targetCount[hover.i] / m.maxTargets) * markT
      : markT;

  return (
    <div ref={ref} className="w-full">
      <div
        style={
          look.cvd == "none" ? undefined : { filter: `url(#cvd-${look.cvd})` }
        }
      >
        <Legend m={m} scale={scale} look={look} />
        {width > 0 && (
          <svg
            width={width}
            height={MT + ph + MB}
            className="text-muted-foreground block select-none"
            style={{ fontSize: narrow ? 9 : 10 }}
          >
            <g transform={`translate(${ML},${MT})`}>
              <g stroke="currentColor" strokeOpacity={0.18}>
                {guides}
              </g>
              {paths.map((d, c) =>
                d ? (
                  <path
                    key={c}
                    d={d}
                    fill={scale.colors[Math.floor(c / 3)]}
                    fillOpacity={BAND_OPACITY[c % 3]}
                    shapeRendering="crispEdges"
                  />
                ) : null,
              )}
              {marks && (
                <g
                  transform={`translate(${pw + GAP},0)`}
                  fill="currentColor"
                  shapeRendering="crispEdges"
                >
                  {marks.right.map((d, k) =>
                    d ? (
                      <path
                        key={k}
                        d={d}
                        fillOpacity={bars ? 0.55 : STRIP_OPACITY[k]}
                      />
                    ) : null,
                  )}
                </g>
              )}
              {marks && showTop && (
                <g
                  transform={`translate(0,${-GAP})`}
                  fill="currentColor"
                  shapeRendering="crispEdges"
                >
                  {marks.top.map((d, k) =>
                    d ? (
                      <path
                        key={k}
                        d={d}
                        fillOpacity={bars ? 0.55 : STRIP_OPACITY[k]}
                      />
                    ) : null,
                  )}
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
                {m.defenders.map((d, j) =>
                  j % stepY == 0 ? (
                    <text
                      key={d.id}
                      x={-6}
                      y={(m.nd - 1 - j) * ch + ch / 2}
                      textAnchor="end"
                      dominantBaseline="central"
                    >
                      {d.name}
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
                  {margins && (
                    <text
                      x={pw + GAP + hoverShareLen + 3}
                      y={(m.nd - 1 - hover.j) * ch + ch / 2}
                      dominantBaseline="central"
                      className="font-mono"
                    >
                      {m.shareCount[hover.j]}
                    </text>
                  )}
                  {showTop && (
                    <text
                      x={Math.min(
                        Math.max(hover.i * cw + cw / 2, 8),
                        pw - 8,
                      )}
                      y={-GAP - hoverTargetLen - 3}
                      textAnchor="middle"
                      className="font-mono"
                    >
                      {m.targetCount[hover.i]}
                    </text>
                  )}
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
                onClick={() => hover && onSelect(m.attackers[hover.i])}
              />
            </g>
          </svg>
        )}
      </div>
      {hover && <CellTooltip m={m} hover={hover} scale={scale} look={look} />}
      <StateLine
        items={[
          `${m.na} attackers x ${m.nd} defenders`,
          `cell ${r2(cw)} x ${r2(ch)} px`,
          `${m.total} targets`,
          `${steps} difficulty steps`,
          `share count 0 to ${m.maxShare}`,
          `target count 0 to ${m.maxTargets}`,
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------- switcher

function useLook() {
  const [look, setLookState] = useState<Look>(DEFAULT_LOOK);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const colour = p.get("colour");
    const share = p.get("share");
    const cvd = p.get("cvd");
    setLookState({
      colour:
        colour && SCHEMES.some((s) => s.key == colour)
          ? colour
          : DEFAULT_LOOK.colour,
      share:
        share && SHARES.some((s) => s.key == share)
          ? share
          : DEFAULT_LOOK.share,
      reverse: p.get("reverse") == "1",
      targets: p.get("targets") != "0",
      cvd: cvd && CVDS.includes(cvd) ? cvd : "none",
    });
  }, []);
  const setLook = (next: Look) => {
    setLookState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("colour", next.colour);
    url.searchParams.set("share", next.share);
    url.searchParams.set("reverse", next.reverse ? "1" : "0");
    url.searchParams.set("targets", next.targets ? "1" : "0");
    url.searchParams.set("cvd", next.cvd);
    window.history.replaceState(null, "", url);
  };
  return [look, setLook] as const;
}

function cycle<T extends { key: string }>(list: T[], key: string, by: number) {
  const index = list.findIndex((v) => v.key == key);
  return list[(index + by + list.length) % list.length].key;
}

function PrototypeSwitcher({
  look,
  onChange,
}: {
  look: Look;
  onChange: (look: Look) => void;
}) {
  const colour = (by: number) =>
    onChange({ ...look, colour: cycle(SCHEMES, look.colour, by) });
  const share = (by: number) =>
    onChange({ ...look, share: cycle(SHARES, look.share, by) });
  const cvd = () =>
    onChange({
      ...look,
      cvd: CVDS[(CVDS.indexOf(look.cvd) + 1) % CVDS.length],
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input, textarea, [contenteditable]")) return;
      if (e.key == "ArrowLeft") (e.shiftKey ? share : colour)(-1);
      if (e.key == "ArrowRight") (e.shiftKey ? share : colour)(1);
      if (e.key == "r") onChange({ ...look, reverse: !look.reverse });
      if (e.key == "t") onChange({ ...look, targets: !look.targets });
      if (e.key == "c") cvd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV == "production") return null;
  const scheme = SCHEMES.find((s) => s.key == look.colour)!;
  const shareName = SHARES.find((s) => s.key == look.share)!.name;
  const toggle = (on: boolean) =>
    "rounded-full px-2 py-0.5 " +
    (on ? "bg-yellow-400 text-black" : "bg-white/15");
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-2xl bg-black px-4 py-2 text-xs text-white shadow-2xl ring-2 ring-yellow-400">
      <span className="flex items-center gap-2 whitespace-nowrap">
        <button onClick={() => colour(-1)} aria-label="Previous colours">
          ←
        </button>
        <span>
          Colour <b>{scheme.key}</b> ({scheme.name})
        </span>
        <button onClick={() => colour(1)} aria-label="Next colours">
          →
        </button>
      </span>
      <span className="flex items-center gap-2 whitespace-nowrap">
        <button onClick={() => share(-1)} aria-label="Previous share display">
          ⇧←
        </button>
        <span>
          Share count <b>{look.share}</b> ({shareName})
        </span>
        <button onClick={() => share(1)} aria-label="Next share display">
          ⇧→
        </button>
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <button
          className={toggle(look.reverse)}
          onClick={() => onChange({ ...look, reverse: !look.reverse })}
        >
          r: reversed
        </button>
        <button
          className={toggle(look.targets)}
          onClick={() => onChange({ ...look, targets: !look.targets })}
        >
          t: target counts
        </button>
        <button className={toggle(look.cvd != "none")} onClick={cvd}>
          c: {look.cvd == "none" ? "full colour" : look.cvd}
        </button>
      </span>
    </div>
  );
}

// Machado, Oliveira and Fernandes (2009), severity 1.0, applied in linear RGB.
function CvdFilters() {
  return (
    <svg width={0} height={0} className="absolute" aria-hidden>
      <defs>
        <filter id="cvd-protan" colorInterpolationFilters="linearRGB">
          <feColorMatrix
            type="matrix"
            values="0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0"
          />
        </filter>
        <filter id="cvd-deutan" colorInterpolationFilters="linearRGB">
          <feColorMatrix
            type="matrix"
            values="0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0"
          />
        </filter>
        <filter id="cvd-tritan" colorInterpolationFilters="linearRGB">
          <feColorMatrix
            type="matrix"
            values="1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0"
          />
        </filter>
      </defs>
    </svg>
  );
}

// ---------------------------------------------------------------- mount

function Direction({
  look,
  scale,
  attackers,
  defenders,
  attackerFaction,
  defenderFaction,
  onSelect,
}: {
  look: Look;
  scale: Scale;
  attackers: GraphData[];
  defenders: GraphData[];
  attackerFaction: string;
  defenderFaction: string;
  onSelect: (attacker: GraphData) => void;
}) {
  const m = useMemo(
    () => buildModel(attackers, defenders, scale.minFF, scale.maxFF),
    [attackers, defenders, scale.minFF, scale.maxFF],
  );
  const [selected, setSelected] = useState("");
  const select = (a: GraphData) => {
    setSelected(a.name);
    onSelect(a);
  };
  return (
    <Card className="col-span-2 lg:col-span-1">
      <CardHeader>
        <CardTitle>Targets for {attackerFaction}</CardTitle>
        <CardDescription>
          {attackerFaction} attackers along the bottom, {defenderFaction}{" "}
          defenders up the side, weakest to strongest. Fair fight{" "}
          {scale.minFF} to {scale.maxFF}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LookHeatmap m={m} scale={scale} look={look} onSelect={select} />
        {selected && <StateLine items={[`selected attacker: ${selected}`]} />}
      </CardContent>
    </Card>
  );
}

export function HeatmapLookPrototype({
  left,
  right,
  leftName,
  rightName,
  minFF,
  easyFF,
  maxFF,
  onSelectLeft,
  onSelectRight,
}: {
  left: GraphData[];
  right: GraphData[];
  leftName: string;
  rightName: string;
  minFF: number;
  easyFF: number;
  maxFF: number;
  onSelectLeft: (attacker: GraphData) => void;
  onSelectRight: (attacker: GraphData) => void;
}) {
  const [look, setLook] = useLook();
  const { resolvedTheme } = useTheme();
  const scheme = SCHEMES.find((s) => s.key == look.colour)!;
  const scale = useMemo(() => {
    const base = resolvedTheme == "dark" ? scheme.dark : scheme.light;
    return {
      scheme,
      colors: look.reverse ? [...base].reverse() : base,
      minFF,
      easyFF,
      maxFF,
    };
  }, [scheme, resolvedTheme, look.reverse, minFF, easyFF, maxFF]);
  return (
    <>
      <CvdFilters />
      <div className="text-muted-foreground col-span-2 rounded-md border border-dashed p-2 font-mono text-[11px]">
        PROTOTYPE · colour {scheme.key}: {scheme.name} ({scheme.note}) · share
        count {look.share}: {SHARES.find((s) => s.key == look.share)!.name} ·{" "}
        {resolvedTheme} theme · {look.reverse ? "reversed" : "default"}{" "}
        direction · colour vision: {look.cvd}
      </div>
      <Direction
        look={look}
        scale={scale}
        attackers={left}
        defenders={right}
        attackerFaction={leftName}
        defenderFaction={rightName}
        onSelect={onSelectLeft}
      />
      <Direction
        look={look}
        scale={scale}
        attackers={right}
        defenders={left}
        attackerFaction={rightName}
        defenderFaction={leftName}
        onSelect={onSelectRight}
      />
      {/* room for the switcher bar */}
      <div className="col-span-2 h-20" />
      <PrototypeSwitcher look={look} onChange={setLook} />
    </>
  );
}
