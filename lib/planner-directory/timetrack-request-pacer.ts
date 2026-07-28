export type TimeTrackRequestPacer = {
  execute<T>(operation: (control: { deferFor(ms: number): void }) => Promise<T>): Promise<T>;
};

export function createTimeTrackRequestPacer(options?: {
  minimumIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): TimeTrackRequestPacer {
  const minimumIntervalMs = options?.minimumIntervalMs ?? 1_500;
  const now = options?.now ?? Date.now;
  const sleep = options?.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let tail: Promise<void> = Promise.resolve();
  let nextAllowedAt = 0;

  return {
    execute<T>(operation: (control: { deferFor(ms: number): void }) => Promise<T>): Promise<T> {
      const scheduled = tail.then(async () => {
        const delay = Math.max(0, nextAllowedAt - now());
        if (delay > 0) await sleep(delay);
        nextAllowedAt = Math.max(nextAllowedAt, now() + minimumIntervalMs);
        return operation({
          deferFor: (ms) => {
            nextAllowedAt = Math.max(nextAllowedAt, now() + Math.max(0, ms));
          },
        });
      });
      tail = scheduled.then(() => undefined, () => undefined);
      return scheduled;
    },
  };
}
