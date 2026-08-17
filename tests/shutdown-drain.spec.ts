import { describe, expect, it } from "vitest";
import { waitForSettled } from "../src/shutdown-drain.js";

/** Build a fake clock that advances by each requested delay. */
function fakeClock(): { now: () => number; delay: (ms: number) => Promise<void>; clock: () => number } {
  let time = 0;
  return {
    now: () => time,
    delay: async (ms: number) => {
      time += ms;
    },
    clock: () => time,
  };
}

describe("waitForSettled", () => {
  it("settles once the predicate stays true for the quiet window", async () => {
    const clock = fakeClock();
    let settled = false;
    const result = await waitForSettled({
      timeoutMs: 100,
      isSettled: () => settled,
      quietMs: 5,
      pollMs: 1,
      now: clock.now,
      delay: async (ms) => {
        await clock.delay(ms);
        if (clock.clock() >= 3) settled = true;
      },
    });
    expect(result.settled).toBe(true);
    expect(result.durationMs).toBe(8);
  });

  it("reports unsettled when the timeout expires", async () => {
    const clock = fakeClock();
    const result = await waitForSettled({
      timeoutMs: 10,
      isSettled: () => false,
      pollMs: 1,
      quietMs: 5,
      now: clock.now,
      delay: clock.delay,
    });
    expect(result.settled).toBe(false);
    expect(result.durationMs).toBe(10);
  });

  it("requires the quiet window to elapse before settling", async () => {
    const clock = fakeClock();
    let quiet = 0;
    const result = await waitForSettled({
      timeoutMs: 100,
      isSettled: () => quiet >= 5,
      quietMs: 10,
      pollMs: 1,
      now: clock.now,
      delay: async (ms) => {
        await clock.delay(ms);
        quiet += 1;
      },
    });
    expect(result.settled).toBe(true);
    // settled at clock=5; the 10ms quiet window needs 10 more polls.
    expect(result.durationMs).toBe(15);
  });
});