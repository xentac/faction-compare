// The rules every view of the two factions shares: the fair fight of an
// attacker against a defender, which fair fights make a target, and which
// members are unavailable. Pure data, no React.

export interface TargetRange {
  // Minimum FF Target: a fair fight of at least this is a target.
  minimum: number;
  // Possible FF Max: a fair fight of this or more is not a target.
  maximum: number;
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

// Whether a fair fight makes the defender a target for the attacker: it is
// known and inside the target range, which includes its minimum and not its
// maximum.
export function isTarget(
  ff: number | null,
  { minimum, maximum }: TargetRange,
): ff is number {
  return ff != null && ff >= minimum && ff < maximum;
}

const UNAVAILABLE_STATES = ["Fallen", "Federal"];

// Whether a member of a faction is unavailable.
export function isUnavailable(member: { status: { state: string } }): boolean {
  return UNAVAILABLE_STATES.includes(member.status.state);
}

// Whether a scouted player is listed in the views: they are in the faction's
// member list (`undefined` when they are not) and are not unavailable.
export function isListed<M extends { status: { state: string } }>(
  member: M | undefined,
): member is M {
  return member != null && !isUnavailable(member);
}
