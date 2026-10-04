// The pinned cell of a target heatmap and the transitions that place, move
// and close it. A pin is either nothing or an attacker and a defender, held
// by member id rather than by grid position, so it stays on its two members
// when the axes change. Pure data, no React.

export interface PinnedCell {
  attackerId: number;
  defenderId: number;
}

// The pin of one heatmap: a pinned cell, or null when nothing is pinned.
export type Pin = PinnedCell | null;

// The two axes a pin moves along: the members in axis order. A direction of
// the war is one.
export interface PinAxes {
  attackers: readonly { id: number }[];
  defenders: readonly { id: number }[];
}

// A position on the axes, as indexes into them.
export interface PinPosition {
  attacker: number;
  defender: number;
}

// Placing: the pin on the cell at a position on the axes. Any cell can be
// pinned, a target or not. A position off the axes pins nothing.
export function placePin(axes: PinAxes, position: PinPosition): Pin {
  const attacker = axes.attackers[position.attacker];
  const defender = axes.defenders[position.defender];
  if (!attacker || !defender) {
    return null;
  }
  return { attackerId: attacker.id, defenderId: defender.id };
}

// Where the pinned cell sits on the axes, or null when nothing is pinned or
// either of its members is not on them.
export function pinnedCellIndex(pin: Pin, axes: PinAxes): PinPosition | null {
  if (!pin) {
    return null;
  }
  const attacker = axes.attackers.findIndex((m) => m.id === pin.attackerId);
  const defender = axes.defenders.findIndex((m) => m.id === pin.defenderId);
  if (attacker < 0 || defender < 0) {
    return null;
  }
  return { attacker, defender };
}

// The four steps of the panel's buttons. "Next" is further along the axis
// order: right along the attackers, up the defenders.
export type PinStep =
  | "previousAttacker"
  | "nextAttacker"
  | "previousDefender"
  | "nextDefender";

// Where a step from the pinned cell lands, or null when there is no pinned
// cell on the axes or the step would leave them.
function stepTarget(
  pin: Pin,
  axes: PinAxes,
  step: PinStep,
): PinPosition | null {
  const at = pinnedCellIndex(pin, axes);
  if (!at) {
    return null;
  }
  const by = step === "nextAttacker" || step === "nextDefender" ? 1 : -1;
  const to =
    step === "previousAttacker" || step === "nextAttacker"
      ? { attacker: at.attacker + by, defender: at.defender }
      : { attacker: at.attacker, defender: at.defender + by };
  return to.attacker >= 0 &&
    to.attacker < axes.attackers.length &&
    to.defender >= 0 &&
    to.defender < axes.defenders.length
    ? to
    : null;
}

// Whether a step has somewhere to go: false at the end of its axis and when
// nothing is pinned.
export function canStepPin(pin: Pin, axes: PinAxes, step: PinStep): boolean {
  return stepTarget(pin, axes, step) != null;
}

// Stepping: the pin moved one member along an axis, through every member,
// targets or not. A step that has nowhere to go leaves the pin as it is.
export function stepPin(pin: Pin, axes: PinAxes, step: PinStep): Pin {
  const to = stepTarget(pin, axes, step);
  return to ? placePin(axes, to) : pin;
}

// Closing: nothing is pinned, whatever was.
export function closePin(): Pin {
  return null;
}

// The axes with, for every attacker, which defenders are their targets:
// cells[attacker index][defender index]. A direction of the war is one.
export interface PinTargets extends PinAxes {
  cells: readonly (readonly { isTarget: boolean }[])[];
}

// Following a selection made elsewhere: the pin moves to the newly selected
// attacker's column.
export function followSelection(
  pin: Pin,
  targets: PinTargets,
  selectedId: number | null,
): Pin {
  if (!pin || selectedId == null) {
    return null;
  }
  if (selectedId === pin.attackerId) {
    return pin;
  }
  const attacker = targets.attackers.findIndex((m) => m.id === selectedId);
  if (attacker < 0) {
    return null;
  }
  const defender = targets.defenders.findIndex((m) => m.id === pin.defenderId);
  // The target nearest the pinned defender along the axis: the defender
  // themselves when they are a target, otherwise the near end of the run.
  let nearest = -1;
  targets.cells[attacker].forEach((cell, d) => {
    if (
      cell.isTarget &&
      (nearest < 0 || Math.abs(d - defender) < Math.abs(nearest - defender))
    ) {
      nearest = d;
    }
  });
  return {
    attackerId: selectedId,
    defenderId: nearest < 0 ? pin.defenderId : targets.defenders[nearest].id,
  };
}

// Holding on when the axes change under the pin, by a target range change or
// a reload of the factions: the pin stays on its two members wherever they
// now sit, and does not move to a target. It closes when either member is no
// longer on the axes.
export function holdPin(pin: Pin, axes: PinAxes): Pin {
  return pinnedCellIndex(pin, axes) ? pin : null;
}
