"use client";
// PROTOTYPE, throwaway. Do not ship.
//
// Four layout variants of the target heatmap, switchable via ?variant=A|B|C|D,
// mounted on the existing Faction Charts tab below the existing charts.
//
// Question (issue #4): how should a target heatmap be laid out so it stays
// legible with up to 100 attackers and 100 defenders?
//
// Targets are a flat single colour. The gradient is a separate ticket.

import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GraphData } from "./types";

const TARGET_COLOR = "#0066FF";

const VARIANTS = [
  { key: "A", name: "Fit to card, square cells, every nth name" },
  { key: "B", name: "Fixed 14px cells, every name, scrolls" },
  { key: "C", name: "Overview plus lens" },
  { key: "D", name: "Stretched to chart height, every nth name" },
];

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
    total,
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// One path for every target in the window. Defender j1-1 is the top row.
// Without a gap, neighbouring targets in a row merge into one rectangle.
function bandPath(
  m: Model,
  i0: number,
  i1: number,
  j0: number,
  j1: number,
  cw: number,
  ch: number,
  gap: number,
  snapEdges = false,
): string {
  const parts: string[] = [];
  // With fractional cells, put every cell edge on a whole device pixel so
  // neighbouring rows and columns share an edge exactly and leave no seam.
  const dpr = typeof window == "undefined" ? 1 : window.devicePixelRatio || 1;
  const edge = (n: number) => (snapEdges ? Math.round(n * dpr) / dpr : n);
  for (let j = j0; j < j1; j++) {
    const y = r2(edge((j1 - 1 - j) * ch));
    const h = r2(edge((j1 - j) * ch) - edge((j1 - 1 - j) * ch) - gap);
    let i = i0;
    while (i < i1) {
      if (!m.target[j * m.na + i]) {
        i++;
        continue;
      }
      let e = i;
      if (gap == 0) {
        while (e + 1 < i1 && m.target[j * m.na + e + 1]) e++;
      }
      const x = r2(edge((i - i0) * cw));
      const w = r2(edge((e + 1 - i0) * cw) - edge((i - i0) * cw) - gap);
      parts.push(`M${x} ${y}h${w}v${h}h${-w}z`);
      i = e + 1;
    }
  }
  return parts.join("");
}

// ---------------------------------------------------------------- shared bits

interface Hover {
  i: number;
  j: number;
  x: number;
  y: number;
}

// Hit-testing by arithmetic on the pointer position inside the plot rect.
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

function useIsLarge() {
  const [large, setLarge] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setLarge(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return large;
}

// Snap a cell size down to a whole device pixel so every cell is the same size.
function snap(size: number): number {
  const dpr = typeof window == "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.max(Math.floor(size * dpr) / dpr, 1 / dpr);
}

function CellTooltip({ m, hover }: { m: Model; hover: Hover }) {
  const a = m.attackers[hover.i];
  const d = m.defenders[hover.j];
  const ff = m.ff[hover.j * m.na + hover.i];
  const isTarget = m.target[hover.j * m.na + hover.i] == 1;
  const flipX = hover.x > window.innerWidth - 260;
  const flipY = hover.y > window.innerHeight - 170;
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
          style={{ background: isTarget ? TARGET_COLOR : "transparent" }}
        />
        {isTarget ? "Target" : "Not a target"}
      </div>
      {row("Attacker", a.name)}
      {row("Defender", d.name)}
      {row("Fair fight", Number.isNaN(ff) ? "unknown" : ff.toFixed(2))}
      {row("Attacker estimate", a.bs_estimate_human ?? "none")}
      {row("Defender estimate", d.bs_estimate_human ?? "none")}
      {row("Share count", "" + m.shareCount[hover.j])}
    </div>
  );
}

function StateLine({ items }: { items: string[] }) {
  return (
    <div className="text-muted-foreground mt-2 font-mono text-[11px]">
      {items.join(" · ")}
    </div>
  );
}

function nth(n: number): string {
  if (n == 1) return "every name";
  if (n == 2) return "every 2nd name";
  if (n == 3) return "every 3rd name";
  return `every ${n}th name`;
}

interface VariantProps {
  m: Model;
  onSelect: (attacker: GraphData) => void;
}

// ---------------------------------------------------------------- A and D
// An svg with names on both axes. "square" sizes cells to the card width;
// "stretch" fills the card width at the height of the existing charts.

function AxisHeatmap({
  m,
  onSelect,
  shape,
}: VariantProps & { shape: "square" | "stretch" }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const large = useIsLarge();
  const [hover, setHover] = useState<Hover | null>(null);

  const narrow = width < 480;
  const ML = narrow ? 72 : 96;
  const MB = narrow ? 72 : 90;
  const MT = 6;
  const MR = 6;
  const avail = Math.max(width - ML - MR, 50);

  let cw: number;
  let ch: number;
  if (shape == "square") {
    cw = ch = snap(avail / m.na);
  } else {
    cw = avail / m.na;
    ch = (large ? 500 : 250) / m.nd;
  }
  const pw = cw * m.na;
  const ph = ch * m.nd;
  const stepY = Math.max(Math.ceil(12 / ch), 1);
  const stepX = Math.max(Math.ceil(15 / cw), 1);

  const path = useMemo(
    () => bandPath(m, 0, m.na, 0, m.nd, cw, ch, 0, shape == "stretch"),
    [m, cw, ch, shape],
  );

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

  return (
    <div ref={ref} className="w-full">
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
            <path d={path} fill={TARGET_COLOR} shapeRendering="crispEdges" />
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
      {hover && <CellTooltip m={m} hover={hover} />}
      <StateLine
        items={[
          `${m.na} attackers x ${m.nd} defenders`,
          `cell ${r2(cw)} x ${r2(ch)} px`,
          `plot ${Math.round(pw)} x ${Math.round(ph)} px`,
          `${m.total} targets`,
          `attackers: ${nth(stepX)}`,
          `defenders: ${nth(stepY)}`,
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------- B
// Fixed-size cells, every name on both axes, sticky axes, scrolls both ways.

function ScrollHeatmap({ m, onSelect }: VariantProps) {
  const CELL = 14;
  const LEFT = 104;
  const BOTTOM = 100;
  const [hover, setHover] = useState<Hover | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pw = CELL * m.na;
  const ph = CELL * m.nd;

  const path = useMemo(
    () => bandPath(m, 0, m.na, 0, m.nd, CELL, CELL, 1),
    [m],
  );

  // start at the origin: weakest attackers against weakest defenders
  useLayoutEffect(() => {
    if (scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [m]);

  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const { c, r } = cellAt(e, m.na, m.nd);
    setHover({ i: c, j: r, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="w-full">
      <div
        ref={scroller}
        className="text-muted-foreground max-h-[min(70vh,640px)] overflow-auto rounded-md border select-none"
        style={{ fontSize: 10 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${LEFT}px ${pw}px`,
            gridTemplateRows: `${ph}px ${BOTTOM}px`,
            width: "max-content",
          }}
        >
          <svg
            width={LEFT}
            height={ph}
            className="bg-card sticky left-0 z-10 block"
          >
            {m.defenders.map((d, j) => (
              <text
                key={d.id}
                x={LEFT - 6}
                y={(m.nd - 1 - j) * CELL + CELL / 2}
                textAnchor="end"
                dominantBaseline="central"
                fill="currentColor"
                className={hover?.j == j ? "fill-foreground" : undefined}
                fontWeight={hover?.j == j ? 700 : 400}
              >
                {d.name}
              </text>
            ))}
          </svg>
          <svg width={pw} height={ph} className="block">
            <path d={path} fill={TARGET_COLOR} shapeRendering="crispEdges" />
            {hover && (
              <g fill="currentColor" fillOpacity={0.16}>
                <rect
                  x={0}
                  y={(m.nd - 1 - hover.j) * CELL}
                  width={pw}
                  height={CELL}
                />
                <rect x={hover.i * CELL} y={0} width={CELL} height={ph} />
              </g>
            )}
            <rect
              width={pw}
              height={ph}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={(e) => {
                if (e.pointerType == "mouse") setHover(null);
              }}
              onClick={() => hover && onSelect(m.attackers[hover.i])}
            />
          </svg>
          <div className="bg-card sticky bottom-0 left-0 z-20" />
          <svg
            width={pw}
            height={BOTTOM}
            className="bg-card sticky bottom-0 z-10 block"
          >
            {m.attackers.map((a, i) => (
              <text
                key={a.id}
                transform={`translate(${i * CELL + CELL / 2},6) rotate(-90)`}
                textAnchor="end"
                dominantBaseline="central"
                fill="currentColor"
                className={hover?.i == i ? "fill-foreground" : undefined}
                fontWeight={hover?.i == i ? 700 : 400}
              >
                {a.name}
              </text>
            ))}
          </svg>
        </div>
      </div>
      {hover && <CellTooltip m={m} hover={hover} />}
      <StateLine
        items={[
          `${m.na} attackers x ${m.nd} defenders`,
          `cell ${CELL} x ${CELL} px`,
          `plot ${pw} x ${ph} px (scrolls)`,
          `${m.total} targets`,
          "every name on both axes",
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------- C
// A small overview with no names, and a lens showing a window of it at full
// size with every name. Hover the overview to move the lens, click to pin it.

function LensHeatmap({ m, onSelect }: VariantProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);
  const [pinned, setPinned] = useState(false);

  const WA = Math.min(15, m.na);
  const WD = Math.min(15, m.nd);

  // start the lens on the middle of the band
  const initial = useMemo(() => {
    let seen = 0;
    for (let j = 0; j < m.nd; j++) {
      for (let i = 0; i < m.na; i++) {
        if (m.target[j * m.na + i] && ++seen >= m.total / 2) return { i, j };
      }
    }
    return { i: Math.floor(m.na / 2), j: Math.floor(m.nd / 2) };
  }, [m]);
  const [center, setCenter] = useState(initial);
  useEffect(() => setCenter(initial), [initial]);

  const i0 = Math.min(Math.max(center.i - Math.floor(WA / 2), 0), m.na - WA);
  const j0 = Math.min(Math.max(center.j - Math.floor(WD / 2), 0), m.nd - WD);

  // overview
  const OL = 44;
  const OB = 46;
  const oSize = Math.min(Math.max(width - OL - 6, 50), 340);
  const oc = snap(oSize / Math.max(m.na, m.nd));
  const opw = oc * m.na;
  const oph = oc * m.nd;
  const overviewPath = useMemo(
    () => bandPath(m, 0, m.na, 0, m.nd, oc, oc, 0),
    [m, oc],
  );

  // lens
  const LL = 100;
  const LB = 84;
  const lc = Math.min(22, Math.floor(Math.max(width - LL - 6, 50) / WA));
  const lpw = lc * WA;
  const lph = lc * WD;
  const lensPath = useMemo(
    () => bandPath(m, i0, i0 + WA, j0, j0 + WD, lc, lc, 1),
    [m, i0, j0, WA, WD, lc],
  );

  const moveLens = (e: ReactPointerEvent<SVGRectElement>, pin: boolean) => {
    if (pinned && !pin && e.buttons == 0) return;
    const { c, r } = cellAt(e, m.na, m.nd);
    setCenter({ i: c, j: r });
    if (pin) setPinned(true);
  };

  const onLensMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const { c, r } = cellAt(e, WA, WD);
    setHover({ i: i0 + c, j: j0 + r, x: e.clientX, y: e.clientY });
  };

  const ticks = (n: number) => {
    const out = [];
    for (let k = 0; k < n; k += 10) out.push(k);
    return out;
  };

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <div
          className="text-muted-foreground flex flex-wrap items-end gap-4 select-none"
          style={{ fontSize: 10 }}
        >
          <div>
            <div className="mb-1 text-[11px]">
              Overview. {pinned ? "Lens pinned: " : "Hover to move the lens, "}
              {pinned ? (
                <button className="underline" onClick={() => setPinned(false)}>
                  unpin
                </button>
              ) : (
                "click or tap to pin."
              )}
            </div>
            <svg width={OL + opw + 6} height={6 + oph + OB} className="block">
              <g transform={`translate(${OL},6)`}>
                <path
                  d={overviewPath}
                  fill={TARGET_COLOR}
                  shapeRendering="crispEdges"
                />
                <rect
                  width={opw}
                  height={oph}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.4}
                />
                <g fill="currentColor">
                  {ticks(m.nd).map((j) => (
                    <text
                      key={j}
                      x={-6}
                      y={(m.nd - 1 - j) * oc + oc / 2}
                      textAnchor="end"
                      dominantBaseline="central"
                    >
                      {m.defenders[j].bs_estimate_human ?? "none"}
                    </text>
                  ))}
                  {ticks(m.na).map((i) => (
                    <text
                      key={i}
                      transform={`translate(${i * oc + oc / 2},${oph + 6}) rotate(-45)`}
                      textAnchor="end"
                      dominantBaseline="central"
                    >
                      {m.attackers[i].bs_estimate_human ?? "none"}
                    </text>
                  ))}
                </g>
                <rect
                  x={i0 * oc}
                  y={(m.nd - j0 - WD) * oc}
                  width={WA * oc}
                  height={WD * oc}
                  className="stroke-foreground"
                  strokeWidth={2}
                  fill="currentColor"
                  fillOpacity={0.12}
                />
                <rect
                  width={opw}
                  height={oph}
                  fill="transparent"
                  style={{ cursor: "crosshair", touchAction: "none" }}
                  onPointerMove={(e) => moveLens(e, false)}
                  onPointerDown={(e) => moveLens(e, true)}
                />
              </g>
            </svg>
          </div>
          <div>
            <div className="mb-1 text-[11px]">
              Lens: attackers {i0 + 1} to {i0 + WA}, defenders {j0 + 1} to{" "}
              {j0 + WD}
            </div>
            <svg width={LL + lpw + 6} height={6 + lph + LB} className="block">
              <g transform={`translate(${LL},6)`}>
                <path
                  d={lensPath}
                  fill={TARGET_COLOR}
                  shapeRendering="crispEdges"
                />
                {hover && hover.i >= i0 && hover.j >= j0 && (
                  <g fill="currentColor" fillOpacity={0.16}>
                    <rect
                      x={0}
                      y={(j0 + WD - 1 - hover.j) * lc}
                      width={lpw}
                      height={lc}
                    />
                    <rect
                      x={(hover.i - i0) * lc}
                      y={0}
                      width={lc}
                      height={lph}
                    />
                  </g>
                )}
                <rect
                  width={lpw}
                  height={lph}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.4}
                />
                {m.defenders.slice(j0, j0 + WD).map((d, k) => (
                  <text
                    key={d.id}
                    x={-6}
                    y={(WD - 1 - k) * lc + lc / 2}
                    textAnchor="end"
                    dominantBaseline="central"
                    fill="currentColor"
                    className={
                      hover?.j == j0 + k ? "fill-foreground" : undefined
                    }
                    fontWeight={hover?.j == j0 + k ? 700 : 400}
                  >
                    {d.name}
                  </text>
                ))}
                {m.attackers.slice(i0, i0 + WA).map((a, k) => (
                  <text
                    key={a.id}
                    transform={`translate(${k * lc + lc / 2},${lph + 8}) rotate(-45)`}
                    textAnchor="end"
                    dominantBaseline="central"
                    fill="currentColor"
                    className={
                      hover?.i == i0 + k ? "fill-foreground" : undefined
                    }
                    fontWeight={hover?.i == i0 + k ? 700 : 400}
                  >
                    {a.name}
                  </text>
                ))}
                <rect
                  width={lpw}
                  height={lph}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onPointerMove={onLensMove}
                  onPointerDown={onLensMove}
                  onPointerLeave={(e) => {
                    if (e.pointerType == "mouse") setHover(null);
                  }}
                  onClick={() => hover && onSelect(m.attackers[hover.i])}
                />
              </g>
            </svg>
          </div>
        </div>
      )}
      {hover && <CellTooltip m={m} hover={hover} />}
      <StateLine
        items={[
          `${m.na} attackers x ${m.nd} defenders`,
          `overview cell ${r2(oc)} px, plot ${Math.round(opw)} x ${Math.round(oph)} px, no names`,
          `lens ${WA} x ${WD} at ${lc} px, every name`,
          `${m.total} targets`,
          pinned ? "lens pinned" : "lens follows hover",
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------- switcher

function useVariant() {
  const [variant, setVariantState] = useState("A");
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("variant");
    if (v && VARIANTS.some((x) => x.key == v)) setVariantState(v);
  }, []);
  const setVariant = (key: string) => {
    setVariantState(key);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", key);
    window.history.replaceState(null, "", url);
  };
  return [variant, setVariant] as const;
}

function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: string;
  onChange: (key: string) => void;
}) {
  const index = VARIANTS.findIndex((v) => v.key == current);
  const step = (by: number) =>
    onChange(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length].key);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input, textarea, [contenteditable]")) return;
      if (e.key == "ArrowLeft") step(-1);
      if (e.key == "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV == "production") return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-4 py-2 text-sm text-white shadow-2xl ring-2 ring-yellow-400">
      <button onClick={() => step(-1)} aria-label="Previous variant">
        ←
      </button>
      <span className="whitespace-nowrap">
        <b>{VARIANTS[index].key}</b> ({VARIANTS[index].name})
      </span>
      <button onClick={() => step(1)} aria-label="Next variant">
        →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- mount

function Direction({
  variant,
  attackers,
  defenders,
  attackerFaction,
  defenderFaction,
  minFF,
  maxFF,
  onSelect,
}: {
  variant: string;
  attackers: GraphData[];
  defenders: GraphData[];
  attackerFaction: string;
  defenderFaction: string;
  minFF: number;
  maxFF: number;
  onSelect: (attacker: GraphData) => void;
}) {
  const m = useMemo(
    () => buildModel(attackers, defenders, minFF, maxFF),
    [attackers, defenders, minFF, maxFF],
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
          defenders up the side, weakest to strongest. Fair fight {minFF} to{" "}
          {maxFF}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {variant == "A" && (
          <AxisHeatmap m={m} onSelect={select} shape="square" />
        )}
        {variant == "B" && <ScrollHeatmap m={m} onSelect={select} />}
        {variant == "C" && <LensHeatmap m={m} onSelect={select} />}
        {variant == "D" && (
          <AxisHeatmap m={m} onSelect={select} shape="stretch" />
        )}
        {selected && (
          <StateLine items={[`selected attacker: ${selected}`]} />
        )}
      </CardContent>
    </Card>
  );
}

export function HeatmapPrototype({
  left,
  right,
  leftName,
  rightName,
  minFF,
  maxFF,
  onSelectLeft,
  onSelectRight,
}: {
  left: GraphData[];
  right: GraphData[];
  leftName: string;
  rightName: string;
  minFF: number;
  maxFF: number;
  onSelectLeft: (attacker: GraphData) => void;
  onSelectRight: (attacker: GraphData) => void;
}) {
  const [variant, setVariant] = useVariant();
  return (
    <>
      <Direction
        variant={variant}
        attackers={left}
        defenders={right}
        attackerFaction={leftName}
        defenderFaction={rightName}
        minFF={minFF}
        maxFF={maxFF}
        onSelect={onSelectLeft}
      />
      <Direction
        variant={variant}
        attackers={right}
        defenders={left}
        attackerFaction={rightName}
        defenderFaction={leftName}
        minFF={minFF}
        maxFF={maxFF}
        onSelect={onSelectRight}
      />
      {/* room for the switcher bar */}
      <div className="col-span-2 h-14" />
      <PrototypeSwitcher current={variant} onChange={setVariant} />
    </>
  );
}
