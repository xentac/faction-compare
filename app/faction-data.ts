import { isTarget, isUnavailable } from "./fair-fight";
import {
  FairFightScore,
  FFScouterJson,
  FFScouterResult,
  GraphData,
  TornFactionBasicApi,
  TornMemberApi,
} from "./types";

export interface FFSettings {
  easyFFMax: number;
  possibleFFMax: number;
  minimumFFTarget: number;
}

// Builds what the faction charts and the Data tab show for each faction:
// one entry per member, lowest battle score estimate first, with their fair
// fight against every opponent and the counts derived from it.
export function buildFactionData(
  leftffscouterdata: FFScouterResult,
  rightffscouterdata: FFScouterResult,
  leftfactiondata: TornFactionBasicApi,
  rightfactiondata: TornFactionBasicApi,
  { easyFFMax, possibleFFMax, minimumFFTarget }: FFSettings,
): { left_data: GraphData[]; right_data: GraphData[] } {
  const sort_function = (a: FFScouterJson, b: FFScouterJson) => {
    if (a.bss_public == null && b.bss_public == null) {
      return 0;
    }
    if (a.bss_public == null) {
      return -1;
    }
    if (b.bss_public == null) {
      return 1;
    }
    return a.bss_public - b.bss_public;
  };
  // factions sorted by lowest battle score estimate to highest
  const sorted_left: FFScouterJson[] =
    leftffscouterdata.toSorted(sort_function);
  const sorted_right: FFScouterJson[] =
    rightffscouterdata.toSorted(sort_function);

  const targetRange = { minimum: minimumFFTarget, maximum: possibleFFMax };

  const map_data = (
    primaryfaction: TornFactionBasicApi,
    opponentfaction: TornFactionBasicApi,
    opponent: FFScouterResult,
  ) => {
    let member_number = 0;
    return (value: FFScouterJson): GraphData => {
      member_number++;
      const member: TornMemberApi | undefined =
        primaryfaction.members["" + value.player_id];
      const opponent_scores = opponent.map(
        (enemy) =>
          new FairFightScore(
            opponentfaction.members["" + enemy.player_id]?.name ?? "Unknown",
            "" + enemy.player_id,
            value.bss_public,
            enemy.bss_public,
            enemy.bs_estimate_human,
          ),
      );
      const lists = {
        easy_attacks: opponent_scores.filter(
          (value) =>
            value.attacker_ff != null && value.attacker_ff <= easyFFMax,
        ),
        possible_attacks: opponent_scores.filter(
          (value) =>
            value.attacker_ff != null &&
            value.attacker_ff <= possibleFFMax &&
            value.attacker_ff > easyFFMax,
        ),
        hard_attacks: opponent_scores.filter(
          (value) =>
            value.attacker_ff != null && value.attacker_ff > possibleFFMax,
        ),
        easy_defends: opponent_scores.filter(
          (value) =>
            value.defender_ff != null && value.defender_ff >= possibleFFMax,
        ),
        possible_defends: opponent_scores.filter(
          (value) =>
            value.defender_ff != null &&
            value.defender_ff < possibleFFMax &&
            value.defender_ff >= easyFFMax,
        ),
        hard_defends: opponent_scores.filter(
          (value) => value.defender_ff != null && value.defender_ff < easyFFMax,
        ),
        targets_attacks: opponent_scores.filter((value) =>
          isTarget(value.attacker_ff, targetRange),
        ),
        targets_defends: opponent_scores.filter((value) =>
          isTarget(value.defender_ff, targetRange),
        ),
      };
      return {
        name: member?.name ?? "Unknown",
        number: member_number,
        id: value.player_id,
        bs_estimate_human: value.bs_estimate_human,
        opponent_scores: opponent_scores,
        bss_public: value.bss_public,
        easy_attacks: lists.easy_attacks,
        easy_attacks_count: lists.easy_attacks.length,
        possible_attacks: lists.possible_attacks,
        possible_attacks_count: lists.possible_attacks.length,
        hard_attacks: lists.hard_attacks,
        hard_attacks_count: lists.hard_attacks.length,
        easy_defends: lists.easy_defends,
        easy_defends_count: lists.easy_defends.length,
        possible_defends: lists.possible_defends,
        possible_defends_count: lists.possible_defends.length,
        hard_defends: lists.hard_defends,
        hard_defends_count: lists.hard_defends.length,
        targets_attacks: lists.targets_attacks,
        targets_attacks_count: lists.targets_attacks.length,
        targets_defends: lists.targets_defends,
        targets_defends_count: lists.targets_defends.length,
      };
    };
  };

  // A scouted player who is not in the member list has no known state and
  // counts as available, as on the target heatmap.
  const no_unavailable = (faction: TornFactionBasicApi) => {
    return (item: FFScouterJson) =>
      !isUnavailable(faction.members["" + item.player_id]);
  };

  // Unavailable members are left out both as primary members and as opponents.
  const available_left = sorted_left.filter(no_unavailable(leftfactiondata));
  const available_right = sorted_right.filter(no_unavailable(rightfactiondata));

  const left_data: GraphData[] = available_left.map(
    map_data(leftfactiondata, rightfactiondata, available_right),
  );
  const right_data: GraphData[] = available_right.map(
    map_data(rightfactiondata, leftfactiondata, available_left),
  );

  return { left_data: left_data, right_data: right_data };
}
