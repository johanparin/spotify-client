import assert from 'node:assert/strict';
import test from 'node:test';

import { PollScheduler } from '../src/renderer/polling.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fakeTimers() {
  let id = 0;
  const timers = new Map<number, { callback(): void; delay: number }>();
  return {
    clearTimer: (timer: number) => timers.delete(timer),
    delays: () => [...timers.values()].map((timer) => timer.delay),
    runNext() {
      const next = timers.entries().next().value as
        [number, { callback(): void; delay: number }] | undefined;
      assert.ok(next);
      timers.delete(next[0]);
      next[1].callback();
    },
    setTimer(callback: () => void, delay: number) {
      id += 1;
      timers.set(id, { callback, delay });
      return id;
    },
  };
}

test(
  'polling permits one request and ignores pre-action results',
  async () => {
    const timers = fakeTimers();
    const first = deferred<string>();
    const second = deferred<string>();
    const requests = [first, second];
    const results: string[] = [];
    const scheduler = new PollScheduler({
      ...timers,
      isVisible: () => true,
      onError: (error) => assert.fail(String(error)),
      onResult: (value) => results.push(value),
      poll: () => requests.shift()!.promise,
    });

    scheduler.start();
    timers.runNext();
    scheduler.refreshNow();
    scheduler.invalidate();
    scheduler.refreshNow();
    first.resolve('old');
    await Promise.resolve();
    assert.deepEqual(results, []);
    assert.deepEqual(timers.delays(), [0]);
    timers.runNext();
    second.resolve('new');
    await Promise.resolve();
    assert.deepEqual(results, ['new']);
    scheduler.stop();
  },
);

test('polling slows while hidden and resumes immediately', async () => {
  const timers = fakeTimers();
  let visible = false;
  const scheduler = new PollScheduler({
    ...timers,
    isVisible: () => visible,
    onError: (error) => assert.fail(String(error)),
    onResult: () => undefined,
    poll: async () => 'state',
  });

  scheduler.start();
  timers.runNext();
  await Promise.resolve();
  assert.deepEqual(timers.delays(), [15_000]);
  visible = true;
  scheduler.visibilityChanged();
  assert.deepEqual(timers.delays(), [0]);
  scheduler.stop();
});
