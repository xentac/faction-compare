import { useEffect, useRef, useState } from "react";
import { Direction, estimateTimeToHits, TimeToHits } from "./direction";
import type { TimeToHitsRequest } from "./time-to-hits.worker";

// Computes one estimate off the render path and hands it to `done`. Returns
// a function that abandons the computation.
export function computeTimeToHits(
  direction: Direction,
  hitGoal: number,
  done: (estimate: TimeToHits) => void,
): () => void {
  let abandoned = false;
  let worker: Worker | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Without a working worker the estimate is computed on the page's thread,
  // after the browser has had the chance to paint. At most once, however
  // often the worker reports an error.
  const computeHere = () => {
    worker?.terminate();
    worker = null;
    if (abandoned || timer != null) {
      return;
    }
    timer = setTimeout(() => {
      if (!abandoned) {
        done(estimateTimeToHits(direction, hitGoal));
      }
    }, 50);
  };
  try {
    worker = new Worker(new URL("./time-to-hits.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<TimeToHits>) => {
      worker?.terminate();
      worker = null;
      if (!abandoned) {
        done(event.data);
      }
    };
    worker.onerror = computeHere;
    const request: TimeToHitsRequest = { direction, hitGoal };
    worker.postMessage(request);
  } catch {
    computeHere();
  }
  return () => {
    abandoned = true;
    worker?.terminate();
    if (timer != null) {
      clearTimeout(timer);
    }
  };
}

// An estimate together with the direction and hit goal it was made for.
interface Computed {
  direction: Direction;
  hitGoal: number;
  estimate: TimeToHits;
}

// Whether a computed estimate was made for this very direction and hit goal.
// The views' `currentEstimate` can only compare what an estimate carries;
// here the direction it was made for is known.
function isFor(
  computed: Computed | null,
  direction: Direction,
  hitGoal: number,
): computed is Computed {
  return (
    computed != null &&
    computed.direction === direction &&
    computed.hitGoal === hitGoal
  );
}

// The time-to-hits estimate of a direction for a hit goal, computed off the
// render path. Null while it is still being computed: an estimate made for a
// different direction or hit goal is never returned.
//
// The estimate is computed only while `enabled`, and is kept when `enabled`
// goes false and comes back, so it is not recomputed unless the direction or
// the hit goal changed. Call it from a component that stays mounted (the
// parent of the views that show the estimate).
export function useTimeToHits(
  direction: Direction,
  hitGoal: number,
  enabled: boolean,
): TimeToHits | null {
  const [computed, setComputed] = useState<Computed | null>(null);
  const latest = useRef(computed);
  useEffect(() => {
    latest.current = computed;
  }, [computed]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (isFor(latest.current, direction, hitGoal)) {
      return;
    }
    return computeTimeToHits(direction, hitGoal, (estimate) =>
      setComputed({ direction, hitGoal, estimate }),
    );
  }, [direction, hitGoal, enabled]);

  return isFor(computed, direction, hitGoal) ? computed.estimate : null;
}
