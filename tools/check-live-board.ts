// Before the site is deployed: whether the live world board flies the rules this build does
// (SIM_VERSION). A page whose runs the board's function would refuse as another version must never
// go out ahead of the function, so the function is deployed first (README: Releasing a
// flight-rules update) and this stops a hosting deploy that would run ahead of it. A board that
// cannot be asked (none configured, the network down, a request turned away) is no reason to hold
// the site back: only a board that answers with other rules is.
import { SIM_VERSION } from '../src/domains/good-lift/sim-version.ts';

const url = process.env.VITE_BOARD_URL;
const day = Math.floor(Date.now() / 86_400_000);
if (!url) console.log('No world board is configured (VITE_BOARD_URL): nothing to check.');
else {
  let version: unknown;
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/board/${day}`, { signal: AbortSignal.timeout(15_000) });
    const body = await response.json() as { ok?: boolean; board?: { version?: unknown } };
    version = body.ok ? body.board?.version : undefined;
  } catch (error) {
    console.warn(`The live board could not be asked (${error instanceof Error ? error.message : String(error)}); deploying anyway.`);
  }
  if (version === undefined) console.warn('The live board did not say which rules it flies; deploying anyway.');
  else if (version !== SIM_VERSION) {
    console.error(`The live board flies SIM_VERSION ${String(version)}, and this build flies ${SIM_VERSION}: deploy the board's function first.`);
    process.exitCode = 1;
  } else console.log(`The live board flies SIM_VERSION ${SIM_VERSION}, as this build does.`);
}
