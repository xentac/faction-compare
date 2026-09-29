// PROTOTYPE, throwaway. Synthetic factions for the heatmap layout prototype,
// used only with ?fake=<attackers>x<defenders> so the layout can be checked
// without an API key. Real faction data is what the layout is judged on.

import { FFScouterResult, TornFactionBasicApi } from "./types";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYLLABLES = [
  "ka", "zor", "mi", "dra", "ven", "lu", "tor", "ash", "ne", "rok", "bel",
  "sy", "qua", "jin", "mor", "el", "vex", "tha", "gri", "on", "pax", "ul",
];

function human(total: number): string {
  if (total >= 1e9) return (total / 1e9).toFixed(2) + "b";
  if (total >= 1e6) return (total / 1e6).toFixed(2) + "m";
  if (total >= 1e3) return (total / 1e3).toFixed(2) + "k";
  return total.toFixed(0);
}

function fakeFaction(
  id: number,
  name: string,
  size: number,
  medianTotal: number,
  seed: number,
): { basic: TornFactionBasicApi; scouter: FFScouterResult } {
  const rand = mulberry32(seed);
  const normal = () => {
    const u = Math.max(rand(), 1e-9);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const members: TornFactionBasicApi["members"] = {};
  const scouter: FFScouterResult = [];
  for (let n = 0; n < size; n++) {
    const playerId = id * 100000 + n;
    const parts = 1 + Math.floor(rand() * 4);
    let memberName = "";
    for (let p = 0; p < parts; p++) {
      memberName += SYLLABLES[Math.floor(rand() * SYLLABLES.length)];
    }
    memberName = memberName[0].toUpperCase() + memberName.slice(1);
    if (rand() < 0.3) memberName += "_" + Math.floor(rand() * 999);
    memberName = memberName.slice(0, 15);

    const roll = rand();
    const state =
      roll < 0.02
        ? "Fallen"
        : roll < 0.04
          ? "Federal"
          : roll < 0.12
            ? "Hospital"
            : roll < 0.2
              ? "Traveling"
              : "Okay";
    members["" + playerId] = {
      name: memberName,
      level: 1 + Math.floor(rand() * 100),
      days_in_faction: Math.floor(rand() * 2000),
      last_action: { status: "Offline", timestamp: 0, relative: "1 hour ago" },
      status: {
        description: state,
        details: "",
        state: state,
        color: "green",
        until: 0,
      },
      position: "Member",
    };

    const noEstimate = rand() < 0.03;
    const total = medianTotal * Math.exp(1.6 * normal());
    scouter.push({
      player_id: playerId,
      fair_fight: null,
      bs_estimate: noEstimate ? null : Math.round(total),
      bs_estimate_human: noEstimate ? null : human(total),
      // battle stat score of an evenly split build: 4 * sqrt(total / 4)
      bss_public: noEstimate ? null : Math.round(2 * Math.sqrt(total)),
      last_updated: null,
    });
  }
  const basic = {
    ID: id,
    name: name,
    tag: "FAKE",
    tag_image: "",
    leader: 0,
    "co-leader": 0,
    respect: 0,
    age: 0,
    capacity: size,
    best_chain: 0,
    raid_wars: {},
    peace: {},
    rank: { level: 0, name: "", division: 0, position: 0, wins: 0 },
    ranked_wars: {},
    members: members,
  } as TornFactionBasicApi;
  return { basic, scouter };
}

// "100" or "100x80" (left faction size x right faction size)
export function fakeFactions(spec: string) {
  const [l, r] = spec.split("x").map((s) => parseInt(s, 10));
  const leftSize = Math.min(Math.max(l || 100, 1), 100);
  const rightSize = Math.min(Math.max(r || leftSize, 1), 100);
  return {
    left: fakeFaction(1, "Synthetic Left", leftSize, 6e8, 11),
    right: fakeFaction(2, "Synthetic Right", rightSize, 4e8, 29),
  };
}
