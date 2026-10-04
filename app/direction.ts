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

// The time-to-hits estimate: how long each attacker of a direction waits for
// targets before reaching the hit goal. A discrete-event simulation of a
// termed war in which every attacker competes for the shared targets from
// t = 0. Only waiting for targets is measured: hits are instant.

// One attacker's waiting time in one case, in minutes.
export type WaitEstimate =
  // The median over the runs, with the 10th and 90th percentiles.
  | { kind: "time"; p10: number; median: number; p90: number }
  // The attacker has no targets.
  | { kind: "never" }
  // The attacker has no battle score estimate.
  | { kind: "none" };

export interface AttackerTimeToHits {
  // The case where every defender serves their full hospital stay.
  fullStays: WaitEstimate;
  // The case where every defender meds out while their medical cooldown
  // allows it.
  medOut: WaitEstimate;
}

export interface TimeToHits {
  hitGoal: number;
  // One entry per attacker, in the order of the direction's attacker axis.
  attackers: AttackerTimeToHits[];
}

export const ESTIMATE_RUNS = 200;
const ESTIMATE_SEED = 20250929;
// A hospital stay after a hit, in minutes.
const STAY_MINIMUM = 15;
const STAY_MAXIMUM = 30;

// A random number in [0, 1); the same seed gives the same sequence.
type Random = () => number;

function seededRandom(seed: number): Random {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How defenders behave once hit. A case is started afresh for each run and
// answers how long the defender at the given axis index, hit at the given
// time, stays in hospital.
type HospitalCase = (
  defenderCount: number,
) => (defender: number, time: number, random: Random) => number;

const fullStays: HospitalCase = () => (_defender, _time, random) =>
  STAY_MINIMUM + random() * (STAY_MAXIMUM - STAY_MINIMUM);

// How long after a hit a defender meds out, in minutes.
const REACTION_MINIMUM = 1;
const REACTION_MAXIMUM = 5;

// The medical cooldown one med out adds and the most a defender can carry,
// in minutes.
const MED_OUT_COOLDOWN = 10;
const COOLDOWN_CAP = 6 * 60;
// A defender stopped by the cap meds out again once their cooldown is under
// this many minutes.
const RESUME_BELOW = 30;

// Every defender meds out on being hit, a reaction delay after the hit, which
// clears the rest of the stay. They do so on every hit while it keeps their
// medical cooldown under the cap; once it would not, they serve full stays
// until the cooldown has decayed to under RESUME_BELOW, then resume. The
// cooldown is looked at when the defender is hit. Everyone starts at zero
// cooldown; it decays one minute per minute.
const medOut: HospitalCase = (defenderCount) => {
  // Each defender's cooldown as it was at the time of their last hit.
  const cooldown = new Float64Array(defenderCount);
  const cooldownAt = new Float64Array(defenderCount);
  // Defenders who hit the cap and are serving full stays.
  const resting = new Uint8Array(defenderCount);
  const serveFullStay = fullStays(defenderCount);
  return (defender, time, random) => {
    const now = Math.max(0, cooldown[defender] - (time - cooldownAt[defender]));
    cooldown[defender] = now;
    cooldownAt[defender] = time;
    if (resting[defender]) {
      if (now < RESUME_BELOW) {
        resting[defender] = 0;
      }
    } else if (now + MED_OUT_COOLDOWN > COOLDOWN_CAP) {
      resting[defender] = 1;
    }
    if (resting[defender]) {
      return serveFullStay(defender, time, random);
    }
    cooldown[defender] = now + MED_OUT_COOLDOWN;
    return REACTION_MINIMUM + random() * (REACTION_MAXIMUM - REACTION_MINIMUM);
  };
};

// One run of the war. Fills `reached` with the time of each attacker's
// goal-reaching hit; an attacker with no targets is left untouched.
function runWar(
  // Per defender, the attackers they are a target for.
  contenders: number[][],
  attackerCount: number,
  hitGoal: number,
  stayAfterHit: ReturnType<HospitalCase>,
  random: Random,
  reached: Float64Array,
) {
  const hitsLeft = new Int32Array(attackerCount).fill(hitGoal);
  // Every defender is out of hospital at t = 0. Infinity marks a defender
  // nobody wants any more.
  const releaseAt = new Float64Array(contenders.length);
  const live: number[] = [];
  for (;;) {
    // The next release. Among simultaneous releases the defender earliest on
    // the axis goes first, which keeps a run deterministic.
    let defender = -1;
    let time = Infinity;
    for (let d = 0; d < releaseAt.length; d++) {
      if (releaseAt[d] < time) {
        time = releaseAt[d];
        defender = d;
      }
    }
    if (defender < 0) {
      return;
    }
    live.length = 0;
    for (const attacker of contenders[defender]) {
      if (hitsLeft[attacker] > 0) {
        live.push(attacker);
      }
    }
    if (live.length === 0) {
      // Attackers only ever leave, so nobody will want this defender again.
      releaseAt[defender] = Infinity;
      continue;
    }
    // One contender at random gets the hit; the others lose nothing.
    const winner = live[Math.floor(random() * live.length)];
    if (--hitsLeft[winner] === 0) {
      reached[winner] = time;
    }
    releaseAt[defender] = time + stayAfterHit(defender, time, random);
  }
}

// Every attacker's estimate in one case.
function estimateCase(
  direction: Direction,
  hitGoal: number,
  hospitalCase: HospitalCase,
): WaitEstimate[] {
  const { attackers, defenders, cells } = direction;
  const contenders = defenders.map((_, d) =>
    attackers.flatMap((_, a) => (cells[a][d].isTarget ? [a] : [])),
  );
  const random = seededRandom(ESTIMATE_SEED);
  const samples = attackers.map(() => new Float64Array(ESTIMATE_RUNS));
  const reached = new Float64Array(attackers.length);
  for (let run = 0; run < ESTIMATE_RUNS; run++) {
    runWar(
      contenders,
      attackers.length,
      hitGoal,
      hospitalCase(defenders.length),
      random,
      reached,
    );
    for (let a = 0; a < attackers.length; a++) {
      samples[a][run] = reached[a];
    }
  }
  return attackers.map((attacker, a) => {
    if (attacker.estimate == null) {
      return { kind: "none" };
    }
    if (attacker.targetCount === 0) {
      return { kind: "never" };
    }
    const sorted = samples[a].sort();
    const percentile = (p: number) =>
      sorted[Math.min(Math.floor(p * ESTIMATE_RUNS), ESTIMATE_RUNS - 1)];
    return {
      kind: "time",
      p10: percentile(0.1),
      median: percentile(0.5),
      p90: percentile(0.9),
    };
  });
}

// The time-to-hits estimate of one direction. The same direction and hit goal
// always give the same numbers. Takes about half a second at 100 by 100, so
// callers keep it off the render path.
export function estimateTimeToHits(
  direction: Direction,
  hitGoal: number,
): TimeToHits {
  // Each case draws from its own sequence, so one case's numbers do not
  // depend on which other cases are computed.
  const goal = Math.max(1, Math.floor(hitGoal));
  const full = estimateCase(direction, goal, fullStays);
  const med = estimateCase(direction, goal, medOut);
  return {
    hitGoal,
    attackers: direction.attackers.map((_, a) => ({
      fullStays: full[a],
      medOut: med[a],
    })),
  };
}

// A length of time in minutes as it is written on the page: "45m", "5h 20m",
// "5h", "1d 3h". From a day up it is given to the nearest hour.
export function formatDuration(minutes: number): string {
  const whole = Math.round(minutes);
  if (whole < 60) {
    return `${whole}m`;
  }
  if (whole < 24 * 60) {
    const hours = Math.floor(whole / 60);
    const rest = whole % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }
  const hours = Math.round(whole / 60);
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days}d` : `${days}d ${rest}h`;
}

// A wait as it is written on the page: the median followed by its band from
// the 10th to the 90th percentile, such as "6h 11m (5h 27m to 6h 33m)". An
// attacker with no targets or no battle score estimate has words instead.
export function formatWait(estimate: WaitEstimate): string {
  if (estimate.kind === "never") {
    return "never (no targets)";
  }
  if (estimate.kind === "none") {
    return "no estimate";
  }
  return `${formatDuration(estimate.median)} (${formatDuration(estimate.p10)} to ${formatDuration(estimate.p90)})`;
}
