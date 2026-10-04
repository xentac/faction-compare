import { describe, expect, test } from "bun:test";
import { edgeBarLength } from "./target-heatmap";

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
