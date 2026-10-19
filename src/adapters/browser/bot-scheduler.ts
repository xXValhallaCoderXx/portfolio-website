import { BOT_FLIGHT, type BotScheduler } from '../../domains/good-lift/meet-bots.ts';

type ScheduledBotWork = {kind: 'idle' | 'timer'; handle: number | ReturnType<typeof setTimeout>};
export const browserBotScheduler: BotScheduler<ScheduledBotWork> = {
  now: () => performance.now(),
  later(work) {
    if (typeof globalThis.requestIdleCallback === 'function') {
      const handle = globalThis.requestIdleCallback(work, {timeout: BOT_FLIGHT.wait});
      return {kind: 'idle', handle};
    }
    return {kind: 'timer', handle: setTimeout(() => work(), 0)};
  },
  cancel(scheduled) {
    if (scheduled.kind === 'idle') globalThis.cancelIdleCallback(scheduled.handle as number);
    else clearTimeout(scheduled.handle);
  },
  onError: error => console.warn('Good Lift: the bots could not fly this sky.', error),
};
