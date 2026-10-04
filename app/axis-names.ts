// The rules for member names on a chart axis: which names are shown, and how
// a name too wide for its reserved space is cut. Pure, so the target heatmap's
// two axes and the ranked chart's name column share them.

// The width in pixels of a piece of text. Callers pass one that measures the
// name at its widest form (bold, or the selected style), so a name's text is
// the same in every state.
export type MeasureText = (text: string) => number;

export const ELLIPSIS = "…";

// The name as it is written in a space of the given width: whole if it fits,
// otherwise its longest start that fits together with an ending ellipsis.
export function fitName(
  name: string,
  space: number,
  measure: MeasureText,
): string {
  if (measure(name) <= space) {
    return name;
  }
  const characters = Array.from(name);
  const cut = (length: number) =>
    characters.slice(0, length).join("").trimEnd() + ELLIPSIS;
  // The longest start that fits, by bisection: a longer start is never
  // narrower.
  let fits = 0;
  let tooLong = characters.length;
  while (tooLong - fits > 1) {
    const middle = (fits + tooLong) >> 1;
    if (measure(cut(middle)) <= space) {
      fits = middle;
    } else {
      tooLong = middle;
    }
  }
  return cut(fits);
}

// Every nth name is shown along an axis: the smallest n for which labels
// `spacing` pixels apart do not overlap, when each member takes `slot` pixels.
export function labelEvery(slot: number, spacing: number): number {
  if (!(slot > 0) || !Number.isFinite(slot)) {
    return 1;
  }
  // The tolerance keeps a slot a rounding error short of a whole label from
  // costing an extra member.
  return Math.max(1, Math.ceil(spacing / slot - 1e-9));
}
