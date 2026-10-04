import { describe, expect, test } from "bun:test";
import { figureLayout, figurePlacement, hoverFigure } from "./ranked-chart";

describe("the figure printed on a hovered row", () => {
  test("both medians with their bands, one part per case, the med-out case named", () => {
    expect(
      hoverFigure({
        fullStays: { kind: "time", p10: 198, median: 246, p90: 279 },
        medOut: { kind: "time", p10: 25, median: 33, p90: 37 },
      }),
    ).toEqual(["4h 6m (3h 18m to 4h 39m)", "med out 33m (25m to 37m)"]);
  });

  test("a row with no time prints nothing: it keeps its own words", () => {
    expect(
      hoverFigure({ fullStays: { kind: "never" }, medOut: { kind: "never" } }),
    ).toBeNull();
    expect(
      hoverFigure({ fullStays: { kind: "none" }, medOut: { kind: "none" } }),
    ).toBeNull();
  });
});

describe("where the figure is printed", () => {
  // A plot 400 px wide with a 100 px name column to its left and 14 px of
  // room to its right, so the card runs from -100 to 414.
  const card = { plotWidth: 400, leftRoom: 100, rightRoom: 14 };

  test("just right of the whiskers when there is room", () => {
    expect(
      figurePlacement({ ...card, start: 20, end: 120, textWidth: 250 }),
    ).toEqual({ x: 126, width: 250 });
  });

  test("left of the whiskers when it would run off the card on the right", () => {
    // Right of the whiskers it would end at 656; left of them it ends 6 px
    // before 300, so it starts at 44.
    expect(
      figurePlacement({ ...card, start: 300, end: 400, textWidth: 250 }),
    ).toEqual({ x: 44, width: 250 });
  });

  test("against the card's right edge when neither side of the whiskers has room", () => {
    // A long band near the right edge: 10 px right of the whiskers, 200 px
    // of plot left of them. The figure ends at the card's edge, 414.
    expect(
      figurePlacement({ ...card, start: 200, end: 404, textWidth: 250 }),
    ).toEqual({ x: 164, width: 250 });
  });

  test("a figure wider than the whole card is squeezed into it", () => {
    // A phone: the card runs from -92 to 134, 226 px in all.
    expect(
      figurePlacement({
        plotWidth: 120,
        leftRoom: 92,
        rightRoom: 14,
        start: 60,
        end: 120,
        textWidth: 300,
      }),
    ).toEqual({ x: -92, width: 226 });
  });
});

describe("how the figure is laid out", () => {
  const card = { plotWidth: 400, leftRoom: 100, rightRoom: 14 };

  test("on one line while that leaves the name uncovered", () => {
    expect(
      figureLayout({
        ...card,
        start: 200,
        end: 404,
        wholeWidth: 250,
        lineWidths: [130, 110],
      }),
    ).toEqual({ x: 164, width: 250, split: false });
  });

  test("on two lines, one per case, when one line would run over the name", () => {
    // A phone: the plot is 180 px wide, so a 250 px line ending at the card's
    // edge (194) would start at -56, over the name. The longer of the two
    // lines is 130 px: right of the whiskers it would end at 286, left of
    // them it would start before the plot, so it ends at the card's edge.
    expect(
      figureLayout({
        plotWidth: 180,
        leftRoom: 92,
        rightRoom: 14,
        start: 100,
        end: 150,
        wholeWidth: 250,
        lineWidths: [130, 110],
      }),
    ).toEqual({ x: 64, width: 130, split: true });
  });
});
