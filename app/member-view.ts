import { DrillDownData, GraphData } from "./types";

export interface MemberView {
  name: string;
  rows: DrillDownData[];
}

const NOTHING_SELECTED: MemberView = { name: "", rows: [] };

// What the member views show for a faction's selected member: the member's
// name and one row per opponent. Nothing selected, or a selected member who
// is no longer in the faction, gives an empty view.
export function memberView(
  faction: GraphData[],
  selectedId: number | null,
): MemberView {
  if (selectedId == null) {
    return NOTHING_SELECTED;
  }
  const member = faction.find((m) => m.id === selectedId);
  if (!member) {
    return NOTHING_SELECTED;
  }
  return {
    name: member.name,
    rows: member.opponent_scores.map((value) => ({
      name: value.name,
      id: value.id,
      attacker_ff: value.attacker_ff,
      defender_ff: value.defender_ff,
      attacker_ff_str: value.attacker_ff_str,
      defender_ff_str: value.defender_ff_str,
      bss_public: value.bss_public,
      bs_estimate_human: value.bs_estimate_human,
    })),
  };
}
