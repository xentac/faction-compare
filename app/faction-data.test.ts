import { describe, expect, test } from "bun:test";
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

const settings = { easyFFMax: 2.5, possibleFFMax: 4.0, minimumFFTarget: 1.75 };

function build(
  left: ReturnType<typeof faction>,
  right: ReturnType<typeof faction>,
  overrides: Partial<typeof settings> = {},
) {
  return buildFactionData(
    left.estimates,
    right.estimates,
    left.basic,
    right.basic,
    { ...settings, ...overrides },
  );
}

// Fair fight is 1 + 8/3 * defender / attacker, so against a 1000 attacker:
// 375 -> 2.0, 750 -> 3.0, 1500 -> 5.0.
const ours = faction("Ours", [{ id: 1, name: "Alice", estimate: 1000 }]);
const theirs = faction("Theirs", [
  { id: 11, name: "Two", estimate: 375 },
  { id: 12, name: "Three", estimate: 750 },
  { id: 13, name: "Five", estimate: 1500 },
]);

describe("Minimum FF Target", () => {
  test("raising it alone lowers an attacker's target count", () => {
    const [alice] = build(ours, theirs).left_data;
    expect(alice.targets_attacks_count).toBe(2);

    const [raised] = build(ours, theirs, { minimumFFTarget: 2.5 }).left_data;
    expect(raised.targets_attacks_count).toBe(1);
    expect(raised.targets_attacks.map((t) => t.name)).toEqual(["Three"]);
  });

  test("raising it alone lowers a defender's attacker count", () => {
    // Seen from Theirs, Alice attacks each of them at 2.0, 3.0 and 5.0.
    const counts = (minimumFFTarget: number) =>
      build(theirs, ours, { minimumFFTarget }).left_data.map(
        (d) => d.targets_defends_count,
      );
    expect(counts(1.75)).toEqual([1, 1, 0]);
    expect(counts(2.5)).toEqual([0, 1, 0]);
  });
});

describe("Unavailable members", () => {
  // Every opponent here is an easy attack (FF 2.0) and a target for Alice.
  const withUnavailable = faction("Theirs", [
    { id: 11, name: "Okay", estimate: 375 },
    { id: 12, name: "Fallen", estimate: 375, state: "Fallen" },
    { id: 13, name: "Federal", estimate: 375, state: "Federal" },
    { id: 14, name: "Hospital", estimate: 375, state: "Hospital" },
  ]);

  test("are not counted as opponents in any attack count", () => {
    const [alice] = build(ours, withUnavailable).left_data;
    expect(alice.easy_attacks_count).toBe(2);
    expect(alice.possible_attacks_count).toBe(0);
    expect(alice.hard_attacks_count).toBe(0);
    expect(alice.targets_attacks_count).toBe(2);
  });

  test("are not counted as opponents in any defend count", () => {
    // Each of them attacks Alice at 1 + 8/3 * 1000/375 = 8.1.
    const [alice] = build(ours, withUnavailable).left_data;
    expect(alice.easy_defends_count).toBe(2);
    expect(alice.possible_defends_count).toBe(0);
    expect(alice.hard_defends_count).toBe(0);

    // Each of them attacks a 140.625 defender at 2.0, inside the target range.
    const weak = faction("Ours", [{ id: 3, name: "Cy", estimate: 140.625 }]);
    const [cy] = build(weak, withUnavailable).left_data;
    expect(cy.targets_defends_count).toBe(2);
  });

  test("do not appear in a member's opponent list", () => {
    const [alice] = build(ours, withUnavailable).left_data;
    expect(alice.opponent_scores.map((o) => o.name)).toEqual([
      "Okay",
      "Hospital",
    ]);
  });

  test("are still left out as primary members", () => {
    const { right_data } = build(ours, withUnavailable);
    expect(right_data.map((m) => m.name)).toEqual(["Okay", "Hospital"]);
    expect(right_data.map((m) => m.number)).toEqual([1, 2]);
  });
});
