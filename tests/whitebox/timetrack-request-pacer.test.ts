import { describe, expect, it } from "vitest";

import { createTimeTrackRequestPacer } from "@/lib/planner-directory/timetrack-request-pacer";

describe("TimeTrack request pacer", () => {
  it("serializes starts with the default 1,500 ms gap", async () => {
    let currentTime = 0;
    const starts: number[] = [];
    const pacer = createTimeTrackRequestPacer({
      now: () => currentTime,
      sleep: async (ms) => {
        currentTime += ms;
      },
    });

    await Promise.all([
      pacer.execute(async () => {
        starts.push(currentTime);
      }),
      pacer.execute(async () => {
        starts.push(currentTime);
      }),
    ]);

    expect(starts).toEqual([0, 1_500]);
  });

  it("shares a 5,000 ms deferred cooldown with later operations", async () => {
    let currentTime = 0;
    const starts: number[] = [];
    const pacer = createTimeTrackRequestPacer({
      now: () => currentTime,
      sleep: async (ms) => {
        currentTime += ms;
      },
    });

    await Promise.all([
      pacer.execute(async (control) => {
        starts.push(currentTime);
        control.deferFor(5_000);
      }),
      pacer.execute(async () => {
        starts.push(currentTime);
      }),
    ]);

    expect(starts).toEqual([0, 5_000]);
  });

  it("releases the queue after a rejected operation", async () => {
    const pacer = createTimeTrackRequestPacer({
      sleep: async () => undefined,
    });
    const failure = new Error("TimeTrack request failed");
    const rejected = pacer.execute(async () => {
      throw failure;
    });
    const following = pacer.execute(async () => "later request ran");

    await expect(rejected).rejects.toThrow(failure);
    await expect(following).resolves.toBe("later request ran");
  });
});
