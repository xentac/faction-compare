import { describe, expect, test } from "bun:test";
import { memberView } from "./member-view";
import { FairFightScore, GraphData } from "./types";

const LIMITS = { easyFFMax: 2.5, possibleFFMax: 4.0 };

function member(
  id: number,
  name: string,
  opponent_scores: FairFightScore[] = [],
): GraphData {
  return {
    name,
    number: id,
    id,
    opponent_scores,
    bss_public: 1000,
    bs_estimate_human: "1k",
    easy_attacks: [],
    possible_attacks: [],
    hard_attacks: [],
    easy_defends: [],
    possible_defends: [],
    hard_defends: [],
    targets_attacks: [],
    targets_defends: [],
    easy_attacks_count: 0,
    possible_attacks_count: 0,
    hard_attacks_count: 0,
    easy_defends_count: 0,
    possible_defends_count: 0,
    hard_defends_count: 0,
    targets_attacks_count: 0,
    targets_defends_count: 0,
  };
}

describe("memberView", () => {
  test("shows nothing selected before any member is selected", () => {
    const faction = [member(1, "Alice"), member(2, "Bob")];

    expect(memberView(faction, null, LIMITS)).toEqual({ name: "", rows: [] });
  });

  test("shows the selected member's name and one row per opponent", () => {
    // Bob (battle score 1000) against opponents of 300, 750 and 1500:
    // attacker FF = 1 + 8/3 * opponent/own = 1.8, 3.0 and 5.0
    // defender FF = 1 + 8/3 * own/opponent = 9.89, 4.56 and 2.78
    const opponents = [
      new FairFightScore("Xena", "11", 1000, 300, "300"),
      new FairFightScore("Yuri", "12", 1000, 750, "750"),
      new FairFightScore("Zed", "13", 1000, 1500, "1.5k"),
    ];
    const faction = [member(1, "Alice"), member(2, "Bob", opponents)];

    const view = memberView(faction, 2, LIMITS);

    expect(view.name).toBe("Bob");
    expect(
      view.rows.map((r) => [
        r.name,
        r.id,
        r.attacker_ff_str,
        r.defender_ff_str,
      ]),
    ).toEqual([
      ["Xena", "11", "1.80", "9.89"],
      ["Yuri", "12", "3.00", "4.56"],
      ["Zed", "13", "5.00", "2.78"],
    ]);
    expect(
      view.rows.map((r) => [r.easy_attack, r.possible_attack, r.hard_attack]),
    ).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(
      view.rows.map((r) => [r.easy_defend, r.possible_defend, r.hard_defend]),
    ).toEqual([
      [0, 0, 1],
      [0, 0, 1],
      [0, 1, 0],
    ]);
    expect(view.rows[2].bss_public).toBe(1500);
    expect(view.rows[2].bs_estimate_human).toBe("1.5k");
  });

  test("follows the FF settings without reselecting", () => {
    const opponents = [new FairFightScore("Yuri", "12", 1000, 750, "750")];
    const faction = [member(2, "Bob", opponents)];

    const [row] = memberView(faction, 2, {
      easyFFMax: 3.5,
      possibleFFMax: 4.0,
    }).rows;

    expect([row.easy_attack, row.possible_attack]).toEqual([1, 0]);
  });

  test("shows nothing selected when the selected member is no longer in the faction", () => {
    const faction = [member(1, "Alice"), member(2, "Bob")];

    expect(memberView(faction, 99, LIMITS)).toEqual({ name: "", rows: [] });
  });

  test("opponents without a fair fight fall in no difficulty band", () => {
    const opponents = [new FairFightScore("Nobody", "14", 1000, null, null)];
    const faction = [member(2, "Bob", opponents)];

    const [row] = memberView(faction, 2, LIMITS).rows;

    expect(row.attacker_ff).toBeNull();
    expect([
      row.easy_attack,
      row.possible_attack,
      row.hard_attack,
      row.easy_defend,
      row.possible_defend,
      row.hard_defend,
    ]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
