import { Direction, estimateTimeToHits } from "./direction";

// Runs the time-to-hits estimate off the page's thread. One request per
// worker: the page starts a worker for each estimate and ends it once the
// answer arrives, or sooner when the answer is no longer wanted.
export interface TimeToHitsRequest {
  direction: Direction;
  hitGoal: number;
}

addEventListener("message", (event: MessageEvent<TimeToHitsRequest>) => {
  const { direction, hitGoal } = event.data;
  postMessage(estimateTimeToHits(direction, hitGoal));
});
