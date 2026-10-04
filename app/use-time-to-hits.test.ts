import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Direction } from "./direction";
import { computeTimeToHits } from "./use-time-to-hits";

// A worker that never answers; the test fires its error handler by hand.
class FailingWorker {
  static started: FailingWorker[] = [];
  onmessage: unknown = null;
  onerror: (() => void) | null = null;
  constructor() {
    FailingWorker.started.push(this);
  }
  postMessage() {}
  terminate() {}
}

const nobody: Direction = {
  targetRange: { minimum: 1.75, maximum: 4 },
  attackers: [],
  defenders: [],
  cells: [],
};

// Longer than the wait before the estimate is computed on the page's thread.
const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

describe("computing without a working worker", () => {
  const realWorker = globalThis.Worker;
  beforeEach(() => {
    FailingWorker.started = [];
    globalThis.Worker = FailingWorker as unknown as typeof Worker;
  });
  afterEach(() => {
    globalThis.Worker = realWorker;
  });

  test("a worker that errors more than once still gives one estimate", async () => {
    let estimates = 0;
    computeTimeToHits(nobody, 20, () => estimates++);
    const [worker] = FailingWorker.started;
    worker.onerror?.();
    worker.onerror?.();
    await settle();
    expect(estimates).toBe(1);
  });

  test("abandoning after repeated errors gives no estimate", async () => {
    let estimates = 0;
    const abandon = computeTimeToHits(nobody, 20, () => estimates++);
    const [worker] = FailingWorker.started;
    worker.onerror?.();
    worker.onerror?.();
    abandon();
    await settle();
    expect(estimates).toBe(0);
  });
});
