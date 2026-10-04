import { describe, expect, test } from "bun:test";
import { buildDirection, Direction } from "./direction";
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
