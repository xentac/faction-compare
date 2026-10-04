import { Direction, DirectionMember } from "./direction";

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
}

function targets(count: number): string {
  return count === 1 ? "(1 target)" : `(${count} targets)`;
}

// A member's battle score estimate as the estimate's source words it.
function estimate(member: DirectionMember): string {
  if (member.estimate == null) {
    return "none";
  }
  return member.estimateHuman ?? "unknown";
}

// The rows for the cell at the given indexes into the direction's two axes.
export function cellDetailRows(
  direction: Direction,
  cell: { attacker: number; defender: number },
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

  return [
    {
      label: "Attacker",
      name: attacker.name,
      value: targets(attacker.targetCount),
    },
    {
      label: "Defender",
      name: defender.name,
      value: `(shared by ${defender.shareCount})`,
    },
    fairFightRow,
    { label: "Attacker estimate", value: estimate(attacker) },
    { label: "Defender estimate", value: estimate(defender) },
  ];
}
