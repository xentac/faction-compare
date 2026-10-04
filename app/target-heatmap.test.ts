import { describe, expect, test } from "bun:test";
import {
  cellAt,
  edgeBarLength,
  plotGeometry,
  tooltipPosition,
} from "./target-heatmap";

describe("edge bar length", () => {
  test("the largest count fills the space and others are in proportion", () => {
    expect(edgeBarLength(60, 60, 28)).toBe(28);
    expect(edgeBarLength(30, 60, 28)).toBe(14);
    expect(edgeBarLength(15, 60, 28)).toBe(7);
  });

  test("a count of zero has no bar", () => {
    expect(edgeBarLength(0, 60, 28)).toBe(0);
    expect(edgeBarLength(0, 0, 28)).toBe(0);
  });

  test("a small count next to a large one still shows", () => {
    expect(edgeBarLength(1, 99, 28)).toBe(1);
  });
});

describe("cell under a pointer position", () => {
  // 4 attackers by 5 defenders, each cell 100 wide and 100 tall.
  const geometry = plotGeometry(4, 5, 400, 500, 1);

  test("attackers run left to right and defenders bottom to top", () => {
    expect(cellAt(geometry, 150, 450)).toEqual({ attacker: 1, defender: 0 });
    expect(cellAt(geometry, 399, 1)).toEqual({ attacker: 3, defender: 4 });
    expect(cellAt(geometry, 0, 250)).toEqual({ attacker: 0, defender: 2 });
  });

  test("a position outside the cell area is no cell", () => {
    expect(cellAt(geometry, -1, 250)).toBeNull();
    expect(cellAt(geometry, 400, 250)).toBeNull();
    expect(cellAt(geometry, 200, -0.5)).toBeNull();
    expect(cellAt(geometry, 200, 500)).toBeNull();
  });

  test("the cell is the one drawn there when edges are pixel-snapped", () => {
    // 3 attackers across 100 px are drawn with edges at 0, 33, 67 and 100.
    const snapped = plotGeometry(3, 3, 100, 100, 1);
    expect(cellAt(snapped, 33.2, 50)?.attacker).toBe(1);
    expect(cellAt(snapped, 66.8, 50)?.attacker).toBe(1);
    expect(cellAt(snapped, 67, 50)?.attacker).toBe(2);
    // Rows are drawn with edges at 100, 67, 33 and 0 from the bottom up.
    expect(cellAt(snapped, 50, 66.8)?.defender).toBe(1);
    expect(cellAt(snapped, 50, 67.2)?.defender).toBe(0);
    expect(cellAt(snapped, 50, 32.9)?.defender).toBe(2);
  });

  test("an empty axis has no cells", () => {
    expect(cellAt(plotGeometry(0, 5, 400, 500, 1), 10, 10)).toBeNull();
  });
});

describe("tooltip position", () => {
  const size = { width: 200, height: 120 };
  const screen = { width: 1000, height: 800 };

  test("sits below and to the right of the pointer, a little off it", () => {
    expect(tooltipPosition({ x: 100, y: 100 }, size, screen)).toEqual({
      left: 112,
      top: 112,
    });
  });

  test("moves to the pointer's left near the right edge of the screen", () => {
    expect(tooltipPosition({ x: 950, y: 100 }, size, screen)).toEqual({
      left: 738,
      top: 112,
    });
  });

  test("moves above the pointer near the bottom of the screen", () => {
    expect(tooltipPosition({ x: 100, y: 780 }, size, screen)).toEqual({
      left: 112,
      top: 648,
    });
  });

  test("stays on a screen too small to clear the pointer", () => {
    const small = { width: 300, height: 200 };
    expect(tooltipPosition({ x: 150, y: 100 }, size, small)).toEqual({
      left: 4,
      top: 4,
    });
  });
});
