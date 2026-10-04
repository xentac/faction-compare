import { describe, expect, test } from "bun:test";
import { buildDirection, Direction } from "./direction";
import {
  canStepPin,
  firstArrowPin,
  followSelection,
  holdPin,
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

describe("the first arrow press with nothing pinned", () => {
  test("with no selected member, pins the first attacker and first defender", () => {
    // Ghost against Blank.
    expect(firstArrowPin(war, null)).toEqual({ attackerId: 2, defenderId: 15 });
  });

  test("a selected attacker with no targets is pinned against the first defender", () => {
    // Low has no targets: Low against Blank.
    expect(firstArrowPin(war, 3)).toEqual({ attackerId: 3, defenderId: 15 });
  });

  test("a selected attacker with targets is pinned at the easiest end of their run", () => {
    // Venqua's targets are Nebel (2.60) and Dorn (3.00): Nebel is the easiest.
    expect(firstArrowPin(war, 1)).toEqual({ attackerId: 1, defenderId: 11 });
  });
});

describe("following a selection made elsewhere", () => {
  test("moves to the selected attacker, keeping a defender who is their target", () => {
    // Low against Dorn, then Venqua is selected: Dorn is a target of Venqua.
    expect(followSelection({ attackerId: 3, defenderId: 12 }, war, 1)).toEqual({
      attackerId: 1,
      defenderId: 12,
    });
  });

  test("moves to the nearest end of the run when the defender is not their target", () => {
    // Venqua's run of targets is Nebel to Dorn. Titan is above it, so the
    // pin lands on Dorn; Blank and Mouse are below it, so it lands on Nebel.
    expect(followSelection({ attackerId: 3, defenderId: 13 }, war, 1)).toEqual({
      attackerId: 1,
      defenderId: 12,
    });
    expect(followSelection({ attackerId: 3, defenderId: 15 }, war, 1)).toEqual({
      attackerId: 1,
      defenderId: 11,
    });
    expect(followSelection({ attackerId: 2, defenderId: 14 }, war, 1)).toEqual({
      attackerId: 1,
      defenderId: 11,
    });
  });

  test("keeps the defender when the selected attacker has no targets", () => {
    // Venqua against Dorn, then Low is selected: Low has no targets.
    expect(followSelection({ attackerId: 1, defenderId: 12 }, war, 3)).toEqual({
      attackerId: 3,
      defenderId: 12,
    });
  });

  test("closes when the selected member is not on the attacker axis", () => {
    expect(
      followSelection({ attackerId: 1, defenderId: 12 }, war, 99),
    ).toBeNull();
    // Nor when nobody is selected any more.
    expect(
      followSelection({ attackerId: 1, defenderId: 12 }, war, null),
    ).toBeNull();
  });

  test("stays put when the selected attacker is already the pinned one", () => {
    // Venqua against Titan, not a target: the pin was put there on purpose.
    const pin: Pin = { attackerId: 1, defenderId: 13 };
    expect(followSelection(pin, war, 1)).toEqual(pin);
  });

  test("a closed pin stays closed: selecting elsewhere opens nothing", () => {
    expect(followSelection(null, war, 1)).toBeNull();
    expect(followSelection(null, war, 99)).toBeNull();
  });
});

describe("a target range change", () => {
  test("holds the pin on the same pair, target or not", () => {
    // Venqua against Dorn (3.00) is a target until the range stops at 2.8;
    // Venqua's only target is then Nebel, and the pin does not move to it.
    const narrowed = buildDirection({
      attackingFaction: attacking.basic,
      defendingFaction: defending.basic,
      attackingEstimates: attacking.estimates,
      defendingEstimates: defending.estimates,
      targetRange: { minimum: 1.75, maximum: 2.8 },
    });
    expect(narrowed.attackers.map((a) => a.targetCount)).toEqual([0, 0, 1]);
    const pin: Pin = { attackerId: 1, defenderId: 12 };
    expect(holdPin(pin, narrowed)).toEqual(pin);
  });
});

describe("a faction reload", () => {
  // The attacking faction without one member, and the remaining estimates
  // changed so that the axis order differs.
  const reload = (
    attackers: FixtureMember[],
    defenders: FixtureMember[],
  ): Direction => {
    const a = faction("Attackers", attackers);
    const d = faction("Defenders", defenders);
    return buildDirection({
      attackingFaction: a.basic,
      defendingFaction: d.basic,
      attackingEstimates: a.estimates,
      defendingEstimates: d.estimates,
      targetRange: { minimum: 1.75, maximum: 4.0 },
    });
  };
  const defenders = [
    { id: 11, name: "Nebel", estimate: 600 },
    { id: 12, name: "Dorn", estimate: 750 },
  ];
  const pin: Pin = { attackerId: 1, defenderId: 12 };

  test("closes the pin when its attacker is gone", () => {
    const without = reload([{ id: 3, name: "Low", estimate: 500 }], defenders);
    expect(holdPin(pin, without)).toBeNull();
  });

  test("closes the pin when its defender is gone", () => {
    const without = reload(
      [{ id: 1, name: "Venqua", estimate: 1000 }],
      [{ id: 11, name: "Nebel", estimate: 600 }],
    );
    expect(holdPin(pin, without)).toBeNull();
  });

  test("follows both members to their new positions when they remain", () => {
    // Venqua now has the lowest estimate and Dorn the highest but one; a new
    // member has joined each faction.
    const moved = reload(
      [
        { id: 1, name: "Venqua", estimate: 100 },
        { id: 3, name: "Low", estimate: 500 },
        { id: 4, name: "Newcomer", estimate: 800 },
      ],
      [
        { id: 11, name: "Nebel", estimate: 600 },
        { id: 12, name: "Dorn", estimate: 900 },
        { id: 16, name: "Giant", estimate: 5000 },
      ],
    );
    expect(pinnedCellIndex(pin, war)).toEqual({ attacker: 2, defender: 3 });
    const held = holdPin(pin, moved);
    expect(held).toEqual(pin);
    expect(pinnedCellIndex(held, moved)).toEqual({ attacker: 0, defender: 1 });
  });

  test("a closed pin stays closed", () => {
    expect(holdPin(null, war)).toBeNull();
  });
});
