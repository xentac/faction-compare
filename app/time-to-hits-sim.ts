// PROTOTYPE, throwaway. Do not ship.
//
// The time-to-hits estimate as settled in issue #8, written only so the
// display prototype (issue #9) has real numbers to show. A discrete-event
// simulation of one direction of the war: every attacker competes for the
// shared targets from t = 0, a released defender goes to one contender at
// random, each hit puts the defender in hospital for 15-30 minutes, and the
// med-out mode lets every defender med out with a perked Small First Aid Kit
// after a 1-5 minute delay until they would pass the 6 hour medical cooldown
// cap. 200 runs from a fixed seed; per attacker the median waiting time and
// the 10th-90th percentile band, in minutes.

export interface SimInput {
  na: number;
  nd: number;
  target: Uint8Array; // [j * na + i], 1 when defender j is a target of attacker i
  hasEstimate: boolean[]; // per attacker
}

export interface SimOptions {
  goal: number; // hit goal, shared by every attacker
  medOut: boolean;
  runs?: number;
  seed?: number;
}

export type Estimate =
  | { kind: "time"; p10: number; p50: number; p90: number }
  | { kind: "never" } // no targets
  | { kind: "blank" }; // no battle score estimate

export interface SimResult {
  estimates: Estimate[]; // per attacker
  runs: number;
  ms: number; // how long the simulation took
}

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

const STAY_MIN = 15;
const STAY_MAX = 30;
const MED_DELAY_MIN = 1;
const MED_DELAY_MAX = 5;
const MED_COOLDOWN = 10; // minutes added per perked Small First Aid Kit
const COOLDOWN_CAP = 6 * 60;
const COOLDOWN_REST_UNTIL = 30;

function oneRun(
  input: SimInput,
  contenders: Int32Array[], // per defender, attacker indices who target them
  goal: number,
  medOut: boolean,
  rand: () => number,
  finish: Float64Array, // out: per attacker, time of the goal-reaching hit
) {
  const { na, nd } = input;
  const hitsLeft = new Int32Array(na).fill(goal);
  const releaseAt = new Float64Array(nd); // 0: available now
  // med-out state per defender
  const cooldownAt = new Float64Array(nd); // the cooldown's value at cooldownTime
  const cooldownTime = new Float64Array(nd);
  const resting = new Uint8Array(nd);
  const live = new Int32Array(na); // scratch

  let t = 0;
  for (;;) {
    // every defender available at t goes to one of its live contenders
    let progressed = false;
    for (let j = 0; j < nd; j++) {
      if (releaseAt[j] > t) continue;
      const list = contenders[j];
      let n = 0;
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        if (hitsLeft[i] > 0) live[n++] = i;
      }
      if (n == 0) {
        releaseAt[j] = Infinity; // nobody left who wants them
        continue;
      }
      const i = live[Math.floor(rand() * n)];
      if (--hitsLeft[i] == 0) finish[i] = t;
      progressed = true;

      let stay = STAY_MIN + rand() * (STAY_MAX - STAY_MIN);
      if (medOut) {
        const cd = Math.max(0, cooldownAt[j] - (t - cooldownTime[j]));
        if (resting[j] && cd < COOLDOWN_REST_UNTIL) resting[j] = 0;
        if (!resting[j]) {
          if (cd + MED_COOLDOWN <= COOLDOWN_CAP) {
            const delay = MED_DELAY_MIN + rand() * (MED_DELAY_MAX - MED_DELAY_MIN);
            stay = Math.min(stay, delay);
            cooldownAt[j] = cd + MED_COOLDOWN;
            cooldownTime[j] = t;
          } else {
            resting[j] = 1;
          }
        }
      }
      releaseAt[j] = t + stay;
    }
    if (progressed) continue; // more defenders may have become wanted at t

    // advance to the next release of a defender somebody still wants
    let next = Infinity;
    for (let j = 0; j < nd; j++) {
      const r = releaseAt[j];
      if (r <= t || r == Infinity || r >= next) continue;
      const list = contenders[j];
      for (let k = 0; k < list.length; k++) {
        if (hitsLeft[list[k]] > 0) {
          next = r;
          break;
        }
      }
    }
    if (next == Infinity) return;
    t = next;
  }
}

export function simulate(input: SimInput, opts: SimOptions): SimResult {
  const start = performance.now();
  const runs = opts.runs ?? 200;
  const rand = mulberry32(opts.seed ?? 20250929);
  const { na, nd } = input;

  const contenders: Int32Array[] = [];
  for (let j = 0; j < nd; j++) {
    const list: number[] = [];
    for (let i = 0; i < na; i++) if (input.target[j * na + i]) list.push(i);
    contenders.push(Int32Array.from(list));
  }
  const targetCount = new Int32Array(na);
  for (let j = 0; j < nd; j++)
    for (let i = 0; i < na; i++) targetCount[i] += input.target[j * na + i];

  const samples: Float64Array[] = [];
  for (let i = 0; i < na; i++) samples.push(new Float64Array(runs));
  const finish = new Float64Array(na);
  for (let r = 0; r < runs; r++) {
    finish.fill(Infinity);
    oneRun(input, contenders, opts.goal, opts.medOut, rand, finish);
    for (let i = 0; i < na; i++) samples[i][r] = finish[i];
  }

  const estimates: Estimate[] = [];
  for (let i = 0; i < na; i++) {
    if (!input.hasEstimate[i]) {
      estimates.push({ kind: "blank" });
    } else if (targetCount[i] == 0) {
      estimates.push({ kind: "never" });
    } else {
      const s = samples[i].sort();
      const q = (p: number) => s[Math.min(Math.floor(p * runs), runs - 1)];
      estimates.push({ kind: "time", p10: q(0.1), p50: q(0.5), p90: q(0.9) });
    }
  }
  return { estimates, runs, ms: performance.now() - start };
}
