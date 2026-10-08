import { describe, expect, test } from "bun:test";
import {
  DATA_POLICY,
  TORN_API_COMMENT,
  TORN_POLICY_VALUES,
  tornFactionUrl,
} from "./data-policy";

describe("tornFactionUrl", () => {
  test("asks for the basic selection and tags the request for the key owner's API log", () => {
    const url = new URL(tornFactionUrl("12345", "abcdefghijklmnop"));
    expect(url.origin + url.pathname).toBe(
      "https://api.torn.com/faction/12345",
    );
    expect(url.searchParams.get("selections")).toBe("basic");
    expect(url.searchParams.get("key")).toBe("abcdefghijklmnop");
    expect(url.searchParams.get("comment")).toBe(TORN_API_COMMENT);
  });
});

describe("DATA_POLICY", () => {
  test("has one row for each column of Torn's disclosure table, in Torn's order", () => {
    expect(DATA_POLICY.map((row) => row.column)).toEqual(
      Object.keys(TORN_POLICY_VALUES) as (keyof typeof TORN_POLICY_VALUES)[],
    );
  });

  test("uses only values Torn allows", () => {
    for (const row of DATA_POLICY) {
      const allowed: readonly string[] = TORN_POLICY_VALUES[row.column];
      expect(allowed).toContain(row.value);
    }
  });

  test("specifies every value Torn marks [specify]", () => {
    const needsSpecify = [
      "Competitive advantage",
      "Personal gain",
      "Other",
      "Custom",
    ];
    for (const row of DATA_POLICY) {
      if (needsSpecify.includes(row.value)) {
        expect(row.specify).toBeTruthy();
      }
    }
  });
});
