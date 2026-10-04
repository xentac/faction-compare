import {
  AttackerTimeToHits,
  CellIndex,
  COMPUTING_WORDS,
  currentEstimate,
  Direction,
  DirectionMember,
  formatWait,
  TimeToHits,
} from "./direction";

// The detail rows of one cell of a target heatmap: what the hover tooltip and
// the pinned-cell panel say about an attacker and a defender. Pure data, no
// React.

export interface DetailRow {
  label: string;
  // A member's full name, shown in bold before the value.
  name?: string;
  value: string;
  // The difficulty step of a target, 0 (easiest) upwards; absent when the
  // cell is not a target.
  difficulty?: number;
  // A remark on the value, such as why the cell is not a target.
  note?: string;
  // A rule is drawn above this row.
  rule?: true;
}

// The time-to-hits estimate the rows end with: the hit goal it is for, and
// the estimate of the cell's direction, or null while it is being computed.
export interface CellTimes {
  hitGoal: number;
  estimate: TimeToHits | null;
}

// An attacker's target count as the Attacker row words it.
function wordTargetCount(count: number): string {
  return count === 1 ? "(1 target)" : `(${count} targets)`;
}

// A member's battle score estimate as the estimate's source words it.
function wordEstimate(member: DirectionMember): string {
  if (member.estimate == null) {
    return "none";
  }
  return member.estimateHuman ?? "unknown";
}

// The rows for the cell at the given indexes into the direction's two axes.
// The last two, under a rule, are about the attacker alone: their time to the
// hit goal in both cases.
export function cellDetailRows(
  direction: Direction,
  cell: CellIndex,
  times: CellTimes,
): DetailRow[] {
  const attacker = direction.attackers[cell.attacker];
  const defender = direction.defenders[cell.defender];
  const { fairFight, difficulty } =
    direction.cells[cell.attacker][cell.defender];

  const fairFightRow: DetailRow = {
    label: "Fair fight",
    value: fairFight == null ? "unknown" : fairFight.toFixed(2),
  };
  if (difficulty != null) {
    fairFightRow.difficulty = difficulty;
  } else {
    const lacking = [attacker, defender]
      .filter((member) => member.estimate == null)
      .map((member) => member.name);
    fairFightRow.note =
      lacking.length === 0
        ? "Not a target"
        : `Not a target: ${lacking.join(" and ")} ${
            lacking.length === 1 ? "has" : "have"
          } no battle score estimate`;
  }

  // An estimate made for another hit goal or other attackers is not this
  // cell's: it counts as still being computed.
  const waits = currentEstimate(times.estimate, direction, times.hitGoal)
    ?.attackers[cell.attacker];
  const wait = (key: keyof AttackerTimeToHits) =>
    waits == null ? COMPUTING_WORDS : formatWait(waits[key]);

  return [
    {
      label: "Attacker",
      name: attacker.name,
      value: wordTargetCount(attacker.targetCount),
    },
    {
      label: "Defender",
      name: defender.name,
      value: `(shared by ${defender.shareCount})`,
    },
    fairFightRow,
    { label: "Attacker estimate", value: wordEstimate(attacker) },
    { label: "Defender estimate", value: wordEstimate(defender) },
    {
      label: `Time to ${times.hitGoal} hits`,
      value: wait("fullStays"),
      rule: true,
    },
    { label: "if defenders med out", value: wait("medOut") },
  ];
}
