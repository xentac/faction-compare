import { FFScouterResult, TornFactionBasicApi } from "./types";

// One direction of the war: one faction's attackers against the other
// faction's defenders. Pure data, no React: everything a direction's views
// (target heatmap, edge bars, tooltip, pinned-cell panel) draw comes from here.

export interface TargetRange {
  // Minimum FF Target: a fair fight of at least this is a target.
  minimum: number;
  // Possible FF Max: a fair fight of this or more is not a target.
  maximum: number;
}

export interface DirectionInput {
  attackingFaction: TornFactionBasicApi;
  defendingFaction: TornFactionBasicApi;
  attackingEstimates: FFScouterResult;
  defendingEstimates: FFScouterResult;
  targetRange: TargetRange;
}

export interface DirectionMember {
  id: number;
  name: string;
  // Battle score estimate; null when the member has none.
  estimate: number | null;
  estimateHuman: string | null;
}

export interface DirectionAttacker extends DirectionMember {
  // The number of defenders who are targets for this attacker.
  targetCount: number;
}

export interface DirectionDefender extends DirectionMember {
  // The number of attackers for whom this defender is a target.
  shareCount: number;
}

export interface DirectionCell {
  // null when either member has no battle score estimate.
  fairFight: number | null;
  isTarget: boolean;
  // Difficulty step, 0 (easiest) to DIFFICULTY_STEPS - 1 (hardest); null when
  // the cell is not a target.
  difficulty: number | null;
}

export const DIFFICULTY_STEPS = 5;

export interface Direction {
  targetRange: TargetRange;
  // Both axes: lowest battle score estimate first, members with no estimate
  // before all others, unavailable members left out.
  attackers: DirectionAttacker[];
  defenders: DirectionDefender[];
  // cells[attacker index][defender index], indexes into the two axes.
  cells: DirectionCell[][];
}

// The fair fight of an attacker against a defender, or null (unknown) when
// either has no battle score estimate.
export function fairFight(
  attackerEstimate: number | null,
  defenderEstimate: number | null,
): number | null {
  if (attackerEstimate == null || defenderEstimate == null) {
    return null;
  }
  return 1 + (8 / 3) * (defenderEstimate / attackerEstimate);
}

// The difficulty step of a fair fight inside the target range: the range is
// cut into DIFFICULTY_STEPS equal spans, each including its lower end.
function difficultyStep(ff: number, { minimum, maximum }: TargetRange): number {
  const step = Math.floor(
    ((ff - minimum) / (maximum - minimum)) * DIFFICULTY_STEPS,
  );
  return Math.min(Math.max(step, 0), DIFFICULTY_STEPS - 1);
}

const UNAVAILABLE_STATES = ["Fallen", "Federal"];

// A faction's available members, lowest battle score estimate first, members
// with no estimate before all others (the order of the existing charts).
function axis(
  faction: TornFactionBasicApi,
  estimates: FFScouterResult,
): DirectionMember[] {
  return estimates
    .filter((e) => {
      const state = faction.members["" + e.player_id]?.status.state;
      return state == null || !UNAVAILABLE_STATES.includes(state);
    })
    .map((e) => ({
      id: e.player_id,
      name: faction.members["" + e.player_id]?.name ?? "Unknown",
      estimate: e.bss_public,
      estimateHuman: e.bs_estimate_human,
    }))
    .toSorted((a, b) => {
      if (a.estimate == null || b.estimate == null) {
        return (a.estimate == null ? 0 : 1) - (b.estimate == null ? 0 : 1);
      }
      return a.estimate - b.estimate;
    });
}

export function buildDirection({
  attackingFaction,
  defendingFaction,
  attackingEstimates,
  defendingEstimates,
  targetRange,
}: DirectionInput): Direction {
  const attackers: DirectionAttacker[] = axis(
    attackingFaction,
    attackingEstimates,
  ).map((member) => ({ ...member, targetCount: 0 }));
  const defenders: DirectionDefender[] = axis(
    defendingFaction,
    defendingEstimates,
  ).map((member) => ({ ...member, shareCount: 0 }));
  const cells = attackers.map((attacker) =>
    defenders.map((defender) => {
      const ff = fairFight(attacker.estimate, defender.estimate);
      const isTarget =
        ff != null && ff >= targetRange.minimum && ff < targetRange.maximum;
      if (isTarget) {
        attacker.targetCount++;
        defender.shareCount++;
      }
      return {
        fairFight: ff,
        isTarget,
        difficulty: isTarget ? difficultyStep(ff, targetRange) : null,
      };
    }),
  );
  return { targetRange, attackers, defenders, cells };
}
