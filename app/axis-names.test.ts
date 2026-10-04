import { describe, expect, test } from "bun:test";
import { fitName, labelEvery } from "./axis-names";

// A stand-in for measured text: wide letters are 12 px, narrow ones 4 px, the
// ellipsis 10 px and everything else 8 px.
function measure(text: string): number {
  let width = 0;
  for (const character of text) {
    if (character === "W") width += 12;
    else if (character === "i") width += 4;
    else if (character === "…") width += 10;
    else width += 8;
  }
  return width;
}

describe("a name that does not fit", () => {
  test("a name no wider than its space is kept whole", () => {
    expect(fitName("Venqua", 48, measure)).toBe("Venqua");
    expect(fitName("Venqua", 200, measure)).toBe("Venqua");
  });

  test("a wider name keeps its start and ends in an ellipsis", () => {
    // "Nebel" is 40 px and the ellipsis 10 px; one more letter would be 58.
    expect(fitName("Nebelvex_555", 50, measure)).toBe("Nebel…");
    expect(fitName("Nebelvex_555", 57, measure)).toBe("Nebel…");
    expect(fitName("Nebelvex_555", 58, measure)).toBe("Nebelv…");
  });

  test("the cut is by measured width, not by character count", () => {
    expect(fitName("WWWWWWWW", 40, measure)).toBe("WW…");
    expect(fitName("iiiiiiiiiiii", 40, measure)).toBe("iiiiiii…");
  });

  test("the cut name is never wider than the space", () => {
    for (let space = 10; space < 96; space++) {
      const fitted = fitName("WiWiNebelvex", space, measure);
      expect(measure(fitted)).toBeLessThanOrEqual(space);
      expect(fitted.endsWith("…")).toBe(true);
    }
  });

  test("a space too small for any letter leaves only the ellipsis", () => {
    expect(fitName("Venqua", 12, measure)).toBe("…");
    expect(fitName("Venqua", 0, measure)).toBe("…");
  });

  test("no space is left before the ellipsis", () => {
    // "Mr " and the ellipsis would fit, but the cut closes up to the letters.
    expect(fitName("Mr Venqua", 34, measure)).toBe("Mr…");
  });
});

describe("every nth name", () => {
  test("every name is shown when each member has room for a label", () => {
    expect(labelEvery(15, 15)).toBe(1);
    expect(labelEvery(40, 12)).toBe(1);
  });

  test("n is the fewest members whose slots together fit a label", () => {
    // 100 attackers across 300 px: 3 px each, a label needs 15 px.
    expect(labelEvery(3, 15)).toBe(5);
    // 100 defenders up 500 px: 5 px each, a label needs 12 px.
    expect(labelEvery(5, 12)).toBe(3);
    expect(labelEvery(1.8, 15)).toBe(9);
  });

  test("a slot a rounding error short of a whole label still counts", () => {
    expect(labelEvery(300 / 100 - 1e-12, 15)).toBe(5);
    expect(labelEvery(0.1 + 0.2, 0.3)).toBe(1);
  });

  test("an empty axis shows every name", () => {
    expect(labelEvery(0, 15)).toBe(1);
    expect(labelEvery(Infinity, 15)).toBe(1);
  });
});
