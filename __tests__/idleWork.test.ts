describe('idle work admission', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());
  const flush = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };

  it('holds jobs through gestures and serializes asynchronous work', async () => {
    const work = require('../src/lib/performance/idleWork');
    let finish!: () => void;
    const first = jest.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    const second = jest.fn();
    work.beginUIInteraction('scroll');
    work.scheduleWhenIdle(first);
    work.scheduleWhenIdle(second);
    jest.runOnlyPendingTimers();
    await flush();
    expect(first).not.toHaveBeenCalled();
    work.endUIInteraction('scroll');
    jest.runOnlyPendingTimers();
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    work.beginUIInteraction('drawer');
    finish();
    await flush();
    jest.runOnlyPendingTimers();
    await flush();
    expect(second).not.toHaveBeenCalled();
    work.endUIInteraction('drawer');
    jest.runOnlyPendingTimers();
    await flush();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('cancels delayed jobs and aborts running work without overlapping it', async () => {
    const work = require('../src/lib/performance/idleWork');
    const delayed = jest.fn();
    work.scheduleWhenIdle(delayed, 100)();
    let finish!: () => void;
    let signal!: AbortSignal;
    const cancel = work.scheduleWhenIdle((next: AbortSignal) => {
      signal = next;
      return new Promise<void>(resolve => {
        finish = resolve;
      });
    });
    const next = jest.fn();
    work.scheduleWhenIdle(next);
    jest.runOnlyPendingTimers();
    await flush();
    cancel();
    expect(signal.aborted).toBe(true);
    jest.runOnlyPendingTimers();
    await flush();
    expect(next).not.toHaveBeenCalled();
    finish();
    await flush();
    jest.runOnlyPendingTimers();
    await flush();
    expect(next).toHaveBeenCalledTimes(1);
    expect(delayed).not.toHaveBeenCalled();
  });

  it('runs user-visible checks despite background I/O but still waits for navigation', async () => {
    const work = require('../src/lib/performance/idleWork');
    let finish!: () => void;
    work.scheduleWhenIdle(() => new Promise<void>(resolve => {finish = resolve;}));
    jest.runOnlyPendingTimers(); await flush();
    const visible = jest.fn();
    const otherBackground = jest.fn();
    work.beginUIInteraction('navigation');
    work.scheduleWhenIdle(visible, 0, true);
    work.scheduleWhenIdle(otherBackground);
    jest.runOnlyPendingTimers(); await flush();
    expect(visible).not.toHaveBeenCalled();
    work.endUIInteraction('navigation');
    jest.runOnlyPendingTimers(); await flush();
    expect(visible).toHaveBeenCalledTimes(1);
    expect(otherBackground).not.toHaveBeenCalled();
    finish(); await flush(); jest.runOnlyPendingTimers(); await flush();
    expect(otherBackground).toHaveBeenCalledTimes(1);
  });

  it('flushes registered slider commits on background and cleanup', () => {
    const work = require('../src/lib/performance/idleWork');
    const commit = jest.fn();
    const cleanup = work.registerInteractionCommit(commit);
    work.flushInteractionCommits();
    expect(commit).toHaveBeenCalledTimes(1);
    cleanup();
    work.flushInteractionCommits();
    expect(commit).toHaveBeenCalledTimes(2);
  });
});
