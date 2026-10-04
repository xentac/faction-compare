import { describe, expect, test } from "bun:test";
import {
  buildDirection,
  Direction,
  estimateTimeToHits,
  formatDuration,
  formatWait,
  medOut,
  nearestRank,
  WaitEstimate,
} from "./direction";
import { buildFactionData } from "./faction-data";
import { FFScouterResult, TornFactionBasicApi } from "./types";

type FixtureMember = {
  id: number;
  name: string;
  estimate: number | null;
  state?: string;
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
        { name: m.name, status: { state: m.state ?? "Okay" } },
      ]),
    ),
  } as unknown as TornFactionBasicApi;
  const estimates = members.map((m) => ({
    player_id: m.id,
    fair_fight: null,
    bs_estimate: null,
    bs_estimate_human: null,
    bss_public: m.estimate,
    last_updated: null,
  }));
  return { basic, estimates };
}

const defaultRange = { minimum: 1.75, maximum: 4.0 };

function direction(
  attacking: ReturnType<typeof faction>,
  defending: ReturnType<typeof faction>,
  targetRange = defaultRange,
): Direction {
  return buildDirection({
    attackingFaction: attacking.basic,
    defendingFaction: defending.basic,
    attackingEstimates: attacking.estimates,
    defendingEstimates: defending.estimates,
    targetRange,
  });
}

// The names of the defenders who are targets for the named attacker.
function targetsOf(d: Direction, attackerName: string): string[] {
  const a = d.attackers.findIndex((m) => m.name === attackerName);
  return d.defenders
    .filter((_, i) => d.cells[a][i].isTarget)
    .map((m) => m.name);
}

// Fair fight is 1 + 8/3 * defender / attacker, so against a 1000 attacker:
// 375 -> 2.0, 750 -> 3.0, 1125 -> 4.0, 1500 -> 5.0.
const alice = faction("Ours", [{ id: 1, name: "Alice", estimate: 1000 }]);

describe("target rule", () => {
  const theirs = faction("Theirs", [
    { id: 11, name: "Under", estimate: 370 },
    { id: 12, name: "Two", estimate: 375 },
    { id: 13, name: "Three", estimate: 750 },
    { id: 14, name: "Four", estimate: 1125 },
    { id: 15, name: "Five", estimate: 1500 },
  ]);

  test("a fair fight equal to the minimum is a target", () => {
    const d = direction(alice, theirs, { minimum: 2.0, maximum: 4.5 });
    expect(targetsOf(d, "Alice")).toEqual(["Two", "Three", "Four"]);
  });

  test("a fair fight equal to the maximum is not a target", () => {
    const d = direction(alice, theirs, { minimum: 1.75, maximum: 4.0 });
    expect(targetsOf(d, "Alice")).toEqual(["Under", "Two", "Three"]);
  });

  test("each cell carries its fair fight", () => {
    const d = direction(alice, theirs);
    expect(d.cells[0].map((c) => c.fairFight)).toEqual([
      expect.closeTo(1.9867, 4),
      2,
      3,
      4,
      5,
    ]);
  });
});

describe("difficulty", () => {
  // Against Alice (1000): 2.0, 2.25, 2.75, 3.0, 3.25, 3.75, 4.25, 5.0.
  const theirs = faction("Theirs", [
    { id: 11, name: "2.00", estimate: 375 },
    { id: 12, name: "2.25", estimate: 468.75 },
    { id: 13, name: "2.75", estimate: 656.25 },
    { id: 14, name: "3.00", estimate: 750 },
    { id: 15, name: "3.25", estimate: 843.75 },
    { id: 16, name: "3.75", estimate: 1031.25 },
    { id: 17, name: "4.25", estimate: 1218.75 },
    { id: 18, name: "5.00", estimate: 1500 },
  ]);
  const steps = (d: Direction) => d.cells[0].map((c) => c.difficulty);

  test("the target range is cut into five equal spans of fair fight, easiest first", () => {
    // 2.0 to 4.5 in spans of 0.5; each span includes its lower end.
    const d = direction(alice, theirs, { minimum: 2.0, maximum: 4.5 });
    expect(steps(d)).toEqual([0, 0, 1, 2, 2, 3, 4, null]);
  });

  test("the spans follow a changed target range", () => {
    // 2.0 to 7.0 in spans of 1.0.
    const wide = direction(alice, theirs, { minimum: 2.0, maximum: 7.0 });
    expect(steps(wide)).toEqual([0, 0, 0, 1, 1, 1, 2, 3]);
    // 1.75 to 4.0 in spans of 0.45: 2.2, 2.65, 3.1, 3.55.
    const usual = direction(alice, theirs);
    expect(steps(usual)).toEqual([0, 1, 2, 2, 3, 4, null, null]);
  });

  test("a fair fight on the boundary between two spans is in the harder one", () => {
    // 1.75 to 4.0 in spans of 0.45: 2.65 starts the third span, 3.55 the
    // fifth.
    const onBoundaries = faction("Theirs", [
      { id: 11, name: "2.65", estimate: 618.75 },
      { id: 12, name: "3.55", estimate: 956.25 },
    ]);
    expect(steps(direction(alice, onBoundaries))).toEqual([2, 4]);
  });

  test("a cell that is not a target has no difficulty", () => {
    const d = direction(alice, theirs, { minimum: 3.0, maximum: 3.5 });
    expect(steps(d)).toEqual([null, null, null, 0, 2, null, null, null]);
  });
});

describe("counts", () => {
  // Fair fights, attacker by defender:
  //            Low(750)  Mid(1500)  High(3000)  Blank
  // Weak 1000    3.0       5.0        9.0         -
  // Mid  2000    2.0       3.0        5.0         -
  // Top  4000    1.5       2.0        3.0         -
  // Blank         -         -          -          -
  const ours = faction("Ours", [
    { id: 1, name: "Weak", estimate: 1000 },
    { id: 2, name: "Mid", estimate: 2000 },
    { id: 3, name: "Top", estimate: 4000 },
    { id: 4, name: "Blank", estimate: null },
    { id: 5, name: "Gone", estimate: 2000, state: "Federal" },
  ]);
  const theirs = faction("Theirs", [
    { id: 11, name: "Low", estimate: 750 },
    { id: 12, name: "Mid", estimate: 1500 },
    { id: 13, name: "High", estimate: 3000 },
    { id: 14, name: "Blank", estimate: null },
    { id: 15, name: "Gone", estimate: 1500, state: "Fallen" },
  ]);
  const d = direction(ours, theirs);

  test("an attacker's target count is the number of defenders who are their targets", () => {
    expect(d.attackers.map((a) => [a.name, a.targetCount])).toEqual([
      ["Blank", 0],
      ["Weak", 1],
      ["Mid", 2],
      ["Top", 2],
    ]);
  });

  test("a defender's share count is the number of attackers they are a target for", () => {
    expect(d.defenders.map((m) => [m.name, m.shareCount])).toEqual([
      ["Blank", 0],
      ["Low", 2],
      ["Mid", 2],
      ["High", 1],
    ]);
  });

  test("target counts agree with the Targets line of the existing charts", () => {
    const settings = { easyFFMax: 2.5, possibleFFMax: 4.0, minimumFFTarget: 2 };
    const charts = buildFactionData(
      ours.estimates,
      theirs.estimates,
      ours.basic,
      theirs.basic,
      settings,
    );
    const both = direction(ours, theirs, { minimum: 2, maximum: 4.0 });
    expect(both.attackers.map((a) => [a.id, a.targetCount])).toEqual(
      charts.left_data.map((m) => [m.id, m.targets_attacks_count]),
    );
    const back = direction(theirs, ours, { minimum: 2, maximum: 4.0 });
    expect(back.attackers.map((a) => [a.id, a.targetCount])).toEqual(
      charts.right_data.map((m) => [m.id, m.targets_attacks_count]),
    );
    expect(both.defenders.map((m) => [m.id, m.shareCount])).toEqual(
      charts.right_data.map((m) => [m.id, m.targets_defends_count]),
    );
  });
});

describe("axes", () => {
  const ours = faction("Ours", [
    { id: 1, name: "Strong", estimate: 3000 },
    { id: 2, name: "Unscouted", estimate: null },
    { id: 3, name: "Weak", estimate: 1000 },
    { id: 4, name: "Gone", estimate: 2000, state: "Fallen" },
    { id: 5, name: "Middle", estimate: 2000 },
  ]);
  const theirs = faction("Theirs", [
    { id: 11, name: "Big", estimate: 2250 },
    { id: 12, name: "Jailed", estimate: 800, state: "Federal" },
    { id: 13, name: "Small", estimate: 750 },
    { id: 14, name: "Mystery", estimate: null },
    { id: 15, name: "Abroad", estimate: 1500, state: "Traveling" },
  ]);
  const d = direction(ours, theirs);
  const names = (members: { name: string }[]) => members.map((m) => m.name);

  test("both axes run by battle score estimate ascending, no estimate first", () => {
    expect(names(d.attackers)).toEqual([
      "Unscouted",
      "Weak",
      "Middle",
      "Strong",
    ]);
    expect(names(d.defenders)).toEqual(["Mystery", "Small", "Abroad", "Big"]);
  });

  test("unavailable members are on neither axis", () => {
    expect(names(d.attackers)).not.toContain("Gone");
    expect(names(d.defenders)).not.toContain("Jailed");
    const reversed = direction(theirs, ours);
    expect(names(reversed.attackers)).not.toContain("Jailed");
    expect(names(reversed.defenders)).not.toContain("Gone");
  });

  test("a member with no battle score estimate stays on the axis, is never a target and has none", () => {
    // Weak (1000) against Small 3.0, Abroad 5.0, Big 7.0.
    expect(targetsOf(d, "Weak")).toEqual(["Small"]);
    expect(targetsOf(d, "Unscouted")).toEqual([]);
    const mystery = d.defenders.findIndex((m) => m.name === "Mystery");
    for (const column of d.cells) {
      expect(column[mystery]).toMatchObject({
        fairFight: null,
        isTarget: false,
      });
    }
    const unscouted = d.attackers.findIndex((m) => m.name === "Unscouted");
    expect(d.cells[unscouted].every((c) => c.fairFight == null)).toBe(true);
  });
});

describe("time formatting", () => {
  test("under an hour is minutes alone", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(0)).toBe("0m");
  });

  test("hours and minutes", () => {
    expect(formatDuration(320)).toBe("5h 20m");
  });

  test("whole hours drop the minutes", () => {
    expect(formatDuration(300)).toBe("5h");
  });

  test("a day or more is days and hours", () => {
    expect(formatDuration(27 * 60)).toBe("1d 3h");
  });

  test("a fraction of a minute is rounded before the units are split", () => {
    expect(formatDuration(59.7)).toBe("1h");
  });

  test("a wait is its median with the band from the 10th to the 90th percentile", () => {
    expect(formatWait({ kind: "time", p10: 327, median: 371, p90: 393 })).toBe(
      "6h 11m (5h 27m to 6h 33m)",
    );
  });

  test("a wait that never ends or has no estimate is worded as on the ranked chart", () => {
    expect(formatWait({ kind: "never" })).toBe("never (no targets)");
    expect(formatWait({ kind: "none" })).toBe("no estimate");
  });
});

describe("time-to-hits estimate", () => {
  // The named attacker's estimate when defenders serve their full stay.
  function waitOf(d: Direction, hitGoal: number, name: string): WaitEstimate {
    const a = d.attackers.findIndex((m) => m.name === name);
    return estimateTimeToHits(d, hitGoal).attackers[a].fullStays;
  }

  // Alice (1000) alone has three targets: 2.0, 2.33 and 3.0.
  const threeTargets = faction("Theirs", [
    { id: 11, name: "One", estimate: 375 },
    { id: 12, name: "Two", estimate: 500 },
    { id: 13, name: "Three", estimate: 750 },
  ]);

  test("an attacker with enough uncontested targets waits zero", () => {
    const d = direction(alice, threeTargets);
    expect(waitOf(d, 3, "Alice")).toEqual({
      kind: "time",
      p10: 0,
      median: 0,
      p90: 0,
    });
  });

  test("an attacker with no targets never reaches the hit goal", () => {
    const tooStrong = faction("Theirs", [
      { id: 11, name: "Five", estimate: 1500 },
    ]);
    expect(waitOf(direction(alice, tooStrong), 20, "Alice")).toEqual({
      kind: "never",
    });
  });

  test("an attacker with no battle score estimate has no estimate", () => {
    const ours = faction("Ours", [
      { id: 1, name: "Alice", estimate: 1000 },
      { id: 2, name: "Unscouted", estimate: null },
    ]);
    const d = direction(ours, threeTargets);
    expect(waitOf(d, 20, "Unscouted")).toEqual({ kind: "none" });
  });

  test("the estimate carries the hit goal and one entry per attacker", () => {
    const d = direction(alice, threeTargets);
    const estimate = estimateTimeToHits(d, 7);
    expect(estimate.hitGoal).toBe(7);
    expect(estimate.attackers).toHaveLength(d.attackers.length);
  });

  test("a single attacker with a single target waits out the stays between their hits", () => {
    const oneTarget = faction("Theirs", [
      { id: 11, name: "Three", estimate: 750 },
    ]);
    const d = direction(alice, oneTarget);
    // The first hit lands at t = 0, so a goal of 5 takes four stays of 15 to
    // 30 minutes.
    const wait = waitOf(d, 5, "Alice");
    if (wait.kind !== "time") {
      throw new Error("expected a time");
    }
    expect(wait.p10).toBeGreaterThanOrEqual(4 * 15);
    expect(wait.p90).toBeLessThanOrEqual(4 * 30);
    expect(wait.p90).toBeGreaterThan(wait.p10);
    expect(waitOf(d, 1, "Alice")).toMatchObject({ kind: "time", median: 0 });
  });

  // Alice and Bob share one target, Shared (3.0 for both). Carol has a
  // target of her own, Alone (3.0 for her, 1.2 for the others); Shared is 21
  // for Carol.
  const contested = direction(
    faction("Ours", [
      { id: 1, name: "Alice", estimate: 1000 },
      { id: 2, name: "Bob", estimate: 1000 },
      { id: 3, name: "Carol", estimate: 100 },
    ]),
    faction("Theirs", [
      { id: 11, name: "Shared", estimate: 750 },
      { id: 12, name: "Alone", estimate: 75 },
    ]),
  );

  test("a contested attacker waits longer than an uncontested one", () => {
    const alice = waitOf(contested, 5, "Alice");
    const bob = waitOf(contested, 5, "Bob");
    const carol = waitOf(contested, 5, "Carol");
    if (alice.kind !== "time" || bob.kind !== "time" || carol.kind !== "time") {
      throw new Error("expected times");
    }
    expect(alice.median).toBeGreaterThan(carol.median);
    expect(bob.median).toBeGreaterThan(carol.median);
    // Carol is in the single attacker, single target position.
    expect(carol.p90).toBeLessThanOrEqual(4 * 30);
    // Between them Alice and Bob need ten hits on Shared, so the slower of
    // the two can take up to nine stays.
    expect(alice.p90).toBeLessThanOrEqual(9 * 30);
  });

  test("the 10th percentile, the median and the 90th percentile are in order", () => {
    for (const attacker of estimateTimeToHits(contested, 5).attackers) {
      for (const wait of [attacker.fullStays, attacker.medOut]) {
        if (wait.kind !== "time") {
          throw new Error("expected a time");
        }
        expect(wait.p10).toBeLessThanOrEqual(wait.median);
        expect(wait.median).toBeLessThanOrEqual(wait.p90);
      }
    }
  });

  test("a percentile is the nearest-rank sample: the smallest with that share of the samples at or below it", () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(nearestRank(samples, 10)).toBe(1);
    expect(nearestRank(samples, 50)).toBe(5);
    expect(nearestRank(samples, 90)).toBe(9);
    expect(nearestRank(samples, 100)).toBe(10);
    expect(nearestRank([7], 10)).toBe(7);
  });

  test("the same direction and hit goal give the same numbers", () => {
    expect(estimateTimeToHits(contested, 5)).toEqual(
      estimateTimeToHits(contested, 5),
    );
  });

  // One attacker against one defender hit over and over: Alice and the single
  // target Three (3.0). The first hit lands at t = 0.
  const oneOnOne = direction(
    alice,
    faction("Theirs", [{ id: 11, name: "Three", estimate: 750 }]),
  );

  // The named attacker's estimate when every defender meds out.
  function medOutWaitOf(d: Direction, hitGoal: number, name: string) {
    const a = d.attackers.findIndex((m) => m.name === name);
    const wait = estimateTimeToHits(d, hitGoal).attackers[a].medOut;
    if (wait.kind !== "time") {
      throw new Error("expected a time");
    }
    return wait;
  }

  test("a defender who meds out is back after a reaction delay of 1 to 5 minutes", () => {
    // A goal of 5 takes four releases.
    const wait = medOutWaitOf(oneOnOne, 5, "Alice");
    expect(wait.p10).toBeGreaterThanOrEqual(4 * 1);
    expect(wait.p90).toBeLessThanOrEqual(4 * 5);
    expect(wait.p90).toBeGreaterThan(wait.p10);
  });

  // Each med out adds 10 minutes of medical cooldown and the 1 to 5 minutes
  // to the next hit take 1 to 5 off, so the cooldown climbs 5 to 9 minutes a
  // hit: the 6 hour cap stops a med out somewhere from the 40th hit to the
  // 72nd, around the 52nd.

  test("a defender hit repeatedly meds out every time until the medical cooldown cap", () => {
    // The first 39 hits are always under the cap.
    const wait = medOutWaitOf(oneOnOne, 40, "Alice");
    expect(wait.p90).toBeLessThanOrEqual(39 * 5);
  });

  test("a med out that would land exactly on the medical cooldown cap does not happen", () => {
    // One defender hit over and over at the same moment, so nothing decays:
    // each med out adds 10 minutes, and the 36th would land on 360, the cap.
    // With the random number at 0 a med out takes 1 minute and a full stay 15.
    const stayAfterHit = medOut(1);
    const stays = Array.from({ length: 36 }, () => stayAfterHit(0, 0, () => 0));
    expect(stays.slice(0, 35)).toEqual(Array(35).fill(1));
    expect(stays[35]).toBe(15);
  });

  test("a defender at the medical cooldown cap serves full stays", () => {
    // Without the cap 61 releases take at most 305 minutes. With it, about
    // ten of them are full stays of 15 to 30 minutes: about 380 minutes.
    const wait = medOutWaitOf(oneOnOne, 62, "Alice");
    expect(wait.median).toBeGreaterThan(330);
  });

  test("a defender whose medical cooldown has decayed to under 30 minutes meds out again", () => {
    // From the cap the cooldown needs some 330 minutes of full stays, about
    // 15 hits, so by the 72nd hit the defender is back to medding out, and
    // the next 38 releases take at most 5 minutes each. Full stays would
    // take at least 15 each.
    const before = medOutWaitOf(oneOnOne, 72, "Alice");
    const after = medOutWaitOf(oneOnOne, 110, "Alice");
    expect(after.median - before.median).toBeLessThanOrEqual(38 * 5);
  });

  test("the med-out case is never slower than full stays", () => {
    for (const hitGoal of [5, 60]) {
      const { attackers } = estimateTimeToHits(contested, hitGoal);
      for (const { fullStays, medOut } of attackers) {
        if (fullStays.kind !== "time" || medOut.kind !== "time") {
          throw new Error("expected times");
        }
        expect(medOut.p10).toBeLessThanOrEqual(fullStays.p10);
        expect(medOut.median).toBeLessThanOrEqual(fullStays.median);
        expect(medOut.p90).toBeLessThanOrEqual(fullStays.p90);
      }
    }
  });

  test("an attacker with no targets or no estimate has the same answer in both cases", () => {
    const ours = faction("Ours", [
      { id: 1, name: "Alice", estimate: 1000 },
      { id: 2, name: "Unscouted", estimate: null },
      { id: 3, name: "Weak", estimate: 10 },
    ]);
    const d = direction(ours, threeTargets);
    const byName = (name: string) =>
      estimateTimeToHits(d, 20).attackers[
        d.attackers.findIndex((m) => m.name === name)
      ];
    expect(byName("Unscouted").medOut).toEqual({ kind: "none" });
    expect(byName("Weak").medOut).toEqual({ kind: "never" });
  });
});
