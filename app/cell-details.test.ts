import { describe, expect, test } from "bun:test";
import { cellDetailRows } from "./cell-details";
import {
  AttackerTimeToHits,
  buildDirection,
  Direction,
  TimeToHits,
} from "./direction";
import { FFScouterResult, TornFactionBasicApi } from "./types";

type FixtureMember = {
  id: number;
  name: string;
  estimate: number | null;
  human: string | null;
};

// A faction and its battle score estimates from a handful of members.
function faction(
  name: string,
  members: FixtureMember[],
): { basic: TornFactionBasicApi; estimates: FFScouterResult } {
  const basic = {
    name,
    members: Object.fromEntries(
      members.map((m) => [
        "" + m.id,
        { name: m.name, status: { state: "Okay" } },
      ]),
    ),
  } as unknown as TornFactionBasicApi;
  const estimates = members.map((m) => ({
    player_id: m.id,
    fair_fight: null,
    bs_estimate: null,
    bs_estimate_human: m.human,
    bss_public: m.estimate,
    last_updated: null,
  }));
  return { basic, estimates };
}

// Venqua (1000) and the estimate-less Ghost attack four defenders. Against
// Venqua: Nebelvex_555 (600) is a fair fight of 2.60, a target; Dorn (750) is
// 3.00, a target; Titan (2000) is 6.33, too hard; Mouse (100) is 1.27, too
// easy; Blank has no estimate.
const attacking = faction("Attackers", [
  { id: 1, name: "Venqua", estimate: 1000, human: "671.90m" },
  { id: 2, name: "Ghost", estimate: null, human: null },
]);
const defending = faction("Defenders", [
  { id: 11, name: "Nebelvex_555", estimate: 600, human: "1.20b" },
  { id: 12, name: "Dorn", estimate: 750, human: "1.50b" },
  { id: 13, name: "Titan", estimate: 2000, human: "9.99b" },
  { id: 14, name: "Mouse", estimate: 100, human: "50.00k" },
  { id: 15, name: "Blank", estimate: null, human: null },
]);
const war: Direction = buildDirection({
  attackingFaction: attacking.basic,
  defendingFaction: defending.basic,
  attackingEstimates: attacking.estimates,
  defendingEstimates: defending.estimates,
  targetRange: { minimum: 1.75, maximum: 4.0 },
});

// A time-to-hits estimate for the war, written down per attacker name: Venqua
// waits, Ghost has no battle score estimate.
function estimateOf(
  d: Direction,
  hitGoal: number,
  waits: Record<string, AttackerTimeToHits>,
): TimeToHits {
  return { hitGoal, attackers: d.attackers.map((m) => waits[m.name]) };
}
const waits: Record<string, AttackerTimeToHits> = {
  Venqua: {
    fullStays: { kind: "time", p10: 327, median: 371, p90: 393 },
    medOut: { kind: "time", p10: 55, median: 62, p90: 68 },
  },
  Ghost: { fullStays: { kind: "none" }, medOut: { kind: "none" } },
};

// The detail rows of the cell of two members, found by name.
function rowsFor(
  d: Direction,
  attackerName: string,
  defenderName: string,
  times: { hitGoal: number; estimate: TimeToHits | null } = {
    hitGoal: 20,
    estimate: estimateOf(d, 20, waits),
  },
) {
  return cellDetailRows(
    d,
    {
      attacker: d.attackers.findIndex((m) => m.name === attackerName),
      defender: d.defenders.findIndex((m) => m.name === defenderName),
    },
    times,
  );
}

describe("detail rows of a cell", () => {
  test("a target shows both members with their counts, the fair fight and both estimates", () => {
    expect(rowsFor(war, "Venqua", "Nebelvex_555").slice(0, 5)).toEqual([
      { label: "Attacker", name: "Venqua", value: "(2 targets)" },
      { label: "Defender", name: "Nebelvex_555", value: "(shared by 1)" },
      { label: "Fair fight", value: "2.60", difficulty: 1 },
      { label: "Attacker estimate", value: "671.90m" },
      { label: "Defender estimate", value: "1.20b" },
    ]);
  });

  test("a cell that is not a target says so and still shows the fair fight", () => {
    expect(rowsFor(war, "Venqua", "Titan")[2]).toEqual({
      label: "Fair fight",
      value: "6.33",
      note: "Not a target",
    });
    expect(rowsFor(war, "Venqua", "Mouse")[2]).toEqual({
      label: "Fair fight",
      value: "1.27",
      note: "Not a target",
    });
  });

  test("a defender with no battle score estimate is named as the reason the fair fight is unknown", () => {
    const rows = rowsFor(war, "Venqua", "Blank");
    expect(rows[2]).toEqual({
      label: "Fair fight",
      value: "unknown",
      note: "Not a target: Blank has no battle score estimate",
    });
    expect(rows[3]).toEqual({ label: "Attacker estimate", value: "671.90m" });
    expect(rows[4]).toEqual({ label: "Defender estimate", value: "none" });
  });

  test("an attacker with no battle score estimate is named as the reason", () => {
    const rows = rowsFor(war, "Ghost", "Dorn");
    expect(rows[0]).toEqual({
      label: "Attacker",
      name: "Ghost",
      value: "(0 targets)",
    });
    expect(rows[2].note).toBe(
      "Not a target: Ghost has no battle score estimate",
    );
    expect(rows[3]).toEqual({ label: "Attacker estimate", value: "none" });
  });

  test("both members are named when neither has a battle score estimate", () => {
    expect(rowsFor(war, "Ghost", "Blank")[2]).toEqual({
      label: "Fair fight",
      value: "unknown",
      note: "Not a target: Ghost and Blank have no battle score estimate",
    });
  });

  test("a single target is counted in the singular", () => {
    const narrow = buildDirection({
      attackingFaction: attacking.basic,
      defendingFaction: defending.basic,
      attackingEstimates: attacking.estimates,
      defendingEstimates: defending.estimates,
      targetRange: { minimum: 2.8, maximum: 4.0 },
    });
    expect(rowsFor(narrow, "Venqua", "Dorn")[0].value).toBe("(1 target)");
  });

  test("the rows end, under a rule, with the attacker's time to the hit goal in both cases", () => {
    expect(rowsFor(war, "Venqua", "Nebelvex_555").slice(5)).toEqual([
      {
        label: "Time to 20 hits",
        value: "6h 11m (5h 27m to 6h 33m)",
        rule: true,
      },
      { label: "if defenders med out", value: "1h 2m (55m to 1h 8m)" },
    ]);
  });

  test("while the estimate is being computed the time rows say so", () => {
    const rows = rowsFor(war, "Venqua", "Nebelvex_555", {
      hitGoal: 35,
      estimate: null,
    });
    expect(rows.slice(5)).toEqual([
      { label: "Time to 35 hits", value: "computing…", rule: true },
      { label: "if defenders med out", value: "computing…" },
    ]);
  });

  test("an estimate made for another hit goal or other attackers is never shown", () => {
    const values = (times: { hitGoal: number; estimate: TimeToHits }) =>
      rowsFor(war, "Venqua", "Nebelvex_555", times)
        .slice(5)
        .map((row) => row.value);
    expect(
      values({ hitGoal: 35, estimate: estimateOf(war, 20, waits) }),
    ).toEqual(["computing…", "computing…"]);
    expect(
      values({
        hitGoal: 20,
        estimate: { hitGoal: 20, attackers: [waits.Venqua] },
      }),
    ).toEqual(["computing…", "computing…"]);
  });

  test("the first time row is labelled with the hit goal", () => {
    const rows = rowsFor(war, "Venqua", "Dorn", {
      hitGoal: 35,
      estimate: estimateOf(war, 35, waits),
    });
    expect(rows.map((row) => row.label).slice(5)).toEqual([
      "Time to 35 hits",
      "if defenders med out",
    ]);
  });

  test("an attacker with no battle score estimate or no targets is worded as on the ranked chart", () => {
    expect(
      rowsFor(war, "Ghost", "Dorn")
        .slice(5)
        .map((row) => row.value),
    ).toEqual(["no estimate", "no estimate"]);
    const noTargets = estimateOf(war, 20, {
      ...waits,
      Venqua: { fullStays: { kind: "never" }, medOut: { kind: "never" } },
    });
    expect(
      rowsFor(war, "Venqua", "Dorn", { hitGoal: 20, estimate: noTargets })
        .slice(5)
        .map((row) => row.value),
    ).toEqual(["never (no targets)", "never (no targets)"]);
  });

  test("the time rows are the same for every cell of an attacker, target or not", () => {
    const target = rowsFor(war, "Venqua", "Nebelvex_555").slice(5);
    expect(rowsFor(war, "Venqua", "Titan").slice(5)).toEqual(target);
    expect(rowsFor(war, "Venqua", "Blank").slice(5)).toEqual(target);
  });
});
