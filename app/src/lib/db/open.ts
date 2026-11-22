import * as SQLite from 'expo-sqlite';
import { syncBuiltInExercises } from './repo';
import { migrate, type Db } from './schema';

const DATABASE_NAME = 'kineticcoach.db';

let opening: Promise<Db> | null = null;

/** Opens the app's database once, migrates it, and shares the connection. */
export function openAppDatabase(): Promise<Db> {
  opening ??= (async () => {
    // In a browser, site storage is "best effort" and can be cleared by the browser; ask for it to be
    // kept. (Native apps store the database as a normal file, so this only matters on web.)
    try {
      const storage = (globalThis as { navigator?: { storage?: { persist?: () => Promise<boolean> } } }).navigator?.storage;
      await storage?.persist?.();
    } catch {
      // not supported: carry on
    }
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    try {
      await db.execAsync('PRAGMA journal_mode = WAL;');
    } catch {
      // Not every platform supports WAL (e.g. the browser build); the default mode works too.
    }
    await migrate(db);
    await syncBuiltInExercises(db);
    return db;
  })().catch((e) => {
    opening = null; // allow a retry after a failure
    throw e;
  });
  return opening;
}
