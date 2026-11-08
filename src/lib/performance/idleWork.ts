// One cancellable job per lane: background and user-visible checks. Native transitions and gestures
// explicitly hold the queue; requestIdleCallback alone cannot see those.
const interactions = new Set<string>();
type Job = {
  run: (signal: AbortSignal) => void | Promise<void>;
  controller: AbortController;
  foreground: boolean;
};
const jobs: Job[] = [];
let scheduled = false;
let running = false;
let foregroundRunning = false;

const pump = () => {
  if (scheduled || interactions.size || !jobs.length) return;
  const canRun = (job: Job) => job.foreground ? !foregroundRunning : !running;
  if (!jobs.some(canRun)) return;
  scheduled = true;
  const start = () => {
    scheduled = false;
    if (interactions.size) return;
    let index = jobs.findIndex(job => job.foreground && canRun(job));
    if (index < 0) index = jobs.findIndex(canRun);
    const job = index < 0 ? undefined : jobs.splice(index, 1)[0];
    if (!job) return;
    if (job.controller.signal.aborted) {
      pump();
      return;
    }
    if (job.foreground) foregroundRunning = true;
    else running = true;
    Promise.resolve()
      .then(() => {
        if (!job.controller.signal.aborted)
          return job.run(job.controller.signal);
      })
      .catch(error => {
        if (!job.controller.signal.aborted)
          console.warn('Background work failed:', error);
      })
      .finally(() => {
        if (job.foreground) foregroundRunning = false;
        else running = false;
        pump();
      });
    // Native foreground checks can run while a background promise waits on I/O.
    pump();
  };
  const idleCallback = (
    globalThis as typeof globalThis & {
      requestIdleCallback?: (callback: () => void) => number;
    }
  ).requestIdleCallback;
  if (idleCallback) idleCallback(start);
  else setTimeout(start, 32);
};

export const beginUIInteraction = (key: string): void => {
  interactions.add(key);
};
export const endUIInteraction = (key: string): void => {
  interactions.delete(key);
  pump();
};

export const scheduleWhenIdle = (
  run: Job['run'],
  delayMs = 0,
  foreground = false,
): (() => void) => {
  const job: Job = {run, controller: new AbortController(), foreground};
  const enqueue = () => {
    if (!job.controller.signal.aborted) {
      jobs.push(job);
      pump();
    }
  };
  const timer = delayMs ? setTimeout(enqueue, delayMs) : undefined;
  if (!delayMs) enqueue();
  return () => {
    if (timer) clearTimeout(timer);
    job.controller.abort();
    const index = jobs.indexOf(job);
    if (index >= 0) jobs.splice(index, 1);
    pump();
  };
};

export const navigationWorkListeners = {
  transitionStart: (event: {target?: string}) =>
    beginUIInteraction('navigation:' + event.target),
  transitionEnd: (event: {target?: string}) =>
    endUIInteraction('navigation:' + event.target),
};

const interactionCommits = new Set<() => void>();
export const registerInteractionCommit = (commit: () => void): (() => void) => {
  interactionCommits.add(commit);
  return () => {
    commit();
    interactionCommits.delete(commit);
  };
};
export const flushInteractionCommits = (): void => {
  interactionCommits.forEach(commit => commit());
};
