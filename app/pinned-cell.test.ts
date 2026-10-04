import { describe, expect, test } from "bun:test";
import { buildDirection, Direction } from "./direction";
import {
  canStepPin,
  closePin,
  Pin,
  pinnedCellIndex,
  placePin,
  stepPin,
} from "./pinned-cell";
import { FFScouterResult, TornFactionBasicApi } from "./types";

type FixtureMember = { id: number; name: string; estimate: number | null };

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
    bs_estimate_human: null,
    bss_public: m.estimate,
    last_updated: null,
  }));
  return { basic, estimates };
}

// Attacker axis, in order: Ghost (no estimate), Low (500), Venqua (1000).
// Defender axis, in order: Blank (no estimate), Mouse (100), Nebel (600),
// Dorn (750), Titan (2000).
// Venqua's targets are Nebel (2.60) and Dorn (3.00); for Venqua, Mouse (1.27)
// is too easy and Titan (6.33) too hard. Low and Ghost have no targets: for
// Low, Mouse (1.53) is too easy and Nebel (4.20) already too hard.
const attacking = faction("Attackers", [
  { id: 1, name: "Venqua", estimate: 1000 },
  { id: 2, name: "Ghost", estimate: null },
  { id: 3, name: "Low", estimate: 500 },
]);
const defending = faction("Defenders", [
  { id: 11, name: "Nebel", estimate: 600 },
  { id: 12, name: "Dorn", estimate: 750 },
  { id: 13, name: "Titan", estimate: 2000 },
  { id: 14, name: "Mouse", estimate: 100 },
  { id: 15, name: "Blank", estimate: null },
]);
const war: Direction = buildDirection({
  attackingFaction: attacking.basic,
  defendingFaction: defending.basic,
  attackingEstimates: attacking.estimates,
  defendingEstimates: defending.estimates,
  targetRange: { minimum: 1.75, maximum: 4.0 },
});

describe("the fixture", () => {
  test("has the axes and targets the tests below rely on", () => {
    expect(war.attackers.map((a) => a.id)).toEqual([2, 3, 1]);
    expect(war.defenders.map((d) => d.id)).toEqual([15, 14, 11, 12, 13]);
    expect(war.attackers.map((a) => a.targetCount)).toEqual([0, 0, 2]);
  });
});

describe("placing a pin", () => {
  test("pins the cell's attacker and defender by member id", () => {
    // Venqua's column, Dorn's row.
    expect(placePin(war, { attacker: 2, defender: 3 })).toEqual({
      attackerId: 1,
      defenderId: 12,
    });
  });

  test("any cell is pinnable: a blank cell, a member with no estimate", () => {
    // Venqua against Titan: not a target.
    expect(placePin(war, { attacker: 2, defender: 4 })).toEqual({
      attackerId: 1,
      defenderId: 13,
    });
    // Ghost against Blank: neither has a battle score estimate.
    expect(placePin(war, { attacker: 0, defender: 0 })).toEqual({
      attackerId: 2,
      defenderId: 15,
    });
  });

  test("a position off the axes pins nothing", () => {
    expect(placePin(war, { attacker: 3, defender: 0 })).toBeNull();
    expect(placePin(war, { attacker: 0, defender: -1 })).toBeNull();
  });
});

describe("where a pin sits on the axes", () => {
  test("a pinned cell is found by its members, not a stored position", () => {
    const pin = placePin(war, { attacker: 2, defender: 3 });
    expect(pinnedCellIndex(pin, war)).toEqual({ attacker: 2, defender: 3 });
  });

  test("no pin has no cell", () => {
    expect(pinnedCellIndex(null, war)).toBeNull();
  });

  test("a pin whose member is not on the axes has no cell", () => {
    expect(pinnedCellIndex({ attackerId: 99, defenderId: 12 }, war)).toBeNull();
    expect(pinnedCellIndex({ attackerId: 1, defenderId: 99 }, war)).toBeNull();
  });
});

describe("stepping a pin", () => {
  // Low against Nebel: the middle of both axes, not a target.
  const middle: Pin = { attackerId: 3, defenderId: 11 };
  const first: Pin = { attackerId: 2, defenderId: 15 };
  const last: Pin = { attackerId: 1, defenderId: 13 };

  test("the next attacker is one member along, keeping the defender", () => {
    expect(stepPin(middle, war, "nextAttacker")).toEqual({
      attackerId: 1,
      defenderId: 11,
    });
  });

  test("the previous attacker is one member back, keeping the defender", () => {
    expect(stepPin(middle, war, "previousAttacker")).toEqual({
      attackerId: 2,
      defenderId: 11,
    });
  });

  test("the next defender is one member along, keeping the attacker", () => {
    expect(stepPin(middle, war, "nextDefender")).toEqual({
      attackerId: 3,
      defenderId: 12,
    });
  });

  test("the previous defender is one member back, keeping the attacker", () => {
    expect(stepPin(middle, war, "previousDefender")).toEqual({
      attackerId: 3,
      defenderId: 14,
    });
  });

  test("steps pass through every member, targets or not", () => {
    // Up Venqua's column from the first defender: Blank and Mouse are not
    // targets, Nebel and Dorn are, Titan is not.
    let pin: Pin = { attackerId: 1, defenderId: 15 };
    const defenders = [];
    for (let i = 0; i < 4; i++) {
      pin = stepPin(pin, war, "nextDefender");
      defenders.push(pin?.defenderId);
    }
    expect(defenders).toEqual([14, 11, 12, 13]);

    // Back along Titan's row, where nobody has a target.
    pin = { attackerId: 1, defenderId: 13 };
    const attackers = [];
    for (let i = 0; i < 2; i++) {
      pin = stepPin(pin, war, "previousAttacker");
      attackers.push(pin?.attackerId);
    }
    expect(attackers).toEqual([3, 2]);
  });

  test("a step past the end of an axis leaves the pin where it is", () => {
    expect(stepPin(first, war, "previousAttacker")).toEqual(first);
    expect(stepPin(first, war, "previousDefender")).toEqual(first);
    expect(stepPin(last, war, "nextAttacker")).toEqual(last);
    expect(stepPin(last, war, "nextDefender")).toEqual(last);
  });

  test("a step is possible except at the end of its axis", () => {
    expect(canStepPin(middle, war, "previousAttacker")).toBe(true);
    expect(canStepPin(middle, war, "nextAttacker")).toBe(true);
    expect(canStepPin(middle, war, "previousDefender")).toBe(true);
    expect(canStepPin(middle, war, "nextDefender")).toBe(true);

    expect(canStepPin(first, war, "previousAttacker")).toBe(false);
    expect(canStepPin(first, war, "previousDefender")).toBe(false);
    expect(canStepPin(first, war, "nextAttacker")).toBe(true);
    expect(canStepPin(first, war, "nextDefender")).toBe(true);

    expect(canStepPin(last, war, "nextAttacker")).toBe(false);
    expect(canStepPin(last, war, "nextDefender")).toBe(false);
    expect(canStepPin(last, war, "previousAttacker")).toBe(true);
    expect(canStepPin(last, war, "previousDefender")).toBe(true);
  });

  test("with nothing pinned there is nothing to step", () => {
    expect(stepPin(null, war, "nextAttacker")).toBeNull();
    expect(canStepPin(null, war, "nextAttacker")).toBe(false);
  });
});

describe("closing a pin", () => {
  test("leaves nothing pinned", () => {
    expect(closePin()).toBeNull();
    expect(pinnedCellIndex(closePin(), war)).toBeNull();
  });
});
