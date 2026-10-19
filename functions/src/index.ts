// Good Lift's world board as a Firebase function: the wiring of runs.js, which does all the work, to
// HTTP and to Firestore. One 2nd-gen HTTPS function, `board`, with the site's origins allowed to read
// it, and the boards kept in Firestore's `boards` collection, one document a day (runs.js). The
// Admin SDK reads and writes them, so firestore.rules can refuse every client. Deployed by hand with
// `firebase deploy --only functions,firestore` (README, Online board); the site's own deploy
// (`--only hosting`) never touches it. tools/build-functions.mjs bundles this into functions/lib.
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { BoardStore, ApiReply } from './board.types.ts';
import { ORIGINS, clientAddress, createBoard } from './runs.ts';

// Where the function runs: beside the Firestore database, so a run's transaction is a short hop.
// Change it with the database's location (README, Online board), before the first deploy.
const REGION = 'us-central1';

// The function's room, kept small and its spend with it: at most three instances, each with a whole
// CPU for the replays (a run is some 8,600 steps, a fifth of a second at most) and a few requests at
// once, given up after 15 seconds.
const OPTIONS = Object.freeze({
  region: REGION,
  cors: [...ORIGINS],
  invoker: 'public',
  maxInstances: 3,
  concurrency: 8,
  cpu: 1,
  memory: '256MiB',
  timeoutSeconds: 15,
});

// Firestore, made the first time a request needs it, so a cold start for a refused run is quick.
let db: Firestore | null = null;
const firestore = () => (db ??= getFirestore(initializeApp()));
const boards = () => firestore().collection('boards');

const store: BoardStore = {
  async read(key) {
    const snap = await boards().doc(key).get();
    return snap.exists ? snap.data() : null;
  },
  update(key, change) {
    const ref = boards().doc(key);
    return firestore().runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const { doc, result } = change(snap.exists ? snap.data() : null);
      if (doc) transaction.set(ref, doc);
      return result;
    });
  },
};

const service = createBoard({ store, log: (message, detail) => logger.warn(message, detail) });

export const board = onRequest(OPTIONS, async (request, response) => {
  let answer: ApiReply;
  try {
    answer = await service.handle({
      method: request.method,
      path: request.path,
      body: request.rawBody ?? request.body,
      ip: clientAddress(request.get('x-forwarded-for'), request.ip),
      authorization: request.get('authorization') ?? '',
    });
  } catch (error) {
    logger.error('Good Lift world board: a request failed', error);
    answer = { status: 500, body: { ok: false, why: 'fault' }, cache: 'no-store' };
  }
  response.set('Cache-Control', answer.cache).status(answer.status).json(answer.body);
});
