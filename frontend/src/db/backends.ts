// Persistence backends.
//  - Android/iOS: SQLite file inside the app's private storage (@capacitor-community/sqlite).
//  - Browser (development): IndexedDB.
//  - Tests: in-memory.
// Data is stored as JSON documents in a `records` table keyed by (collection, id).
// A `meta` table tracks the schema version so migrations run exactly once.

import { Capacitor } from "@capacitor/core";

export interface StoredRecord {
  collection: string;
  id: string;
  data: string; // JSON
}

export interface StorageBackend {
  readonly kind: "sqlite" | "indexeddb" | "memory";
  init(): Promise<void>;
  loadAll(): Promise<StoredRecord[]>;
  /** Apply a batch atomically. `data === null` deletes. `clear` wipes every record first, in the same transaction. */
  write(batch: { collection: string; id: string; data: string | null }[], opts?: WriteOptions): Promise<void>;
  clear(): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

export interface WriteOptions {
  clear?: boolean;
}

const DB_NAME = "lifeos";

// ---------------------------------------------------------------- SQLite (native)
export class SqliteBackend implements StorageBackend {
  readonly kind = "sqlite" as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;

  async init() {
    const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    await sqlite.checkConnectionsConsistency().catch(() => undefined);
    const exists = (await sqlite.isConnection(DB_NAME, false)).result;
    this.db = exists
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
    await this.db.open();
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS records (
         collection TEXT NOT NULL,
         id TEXT NOT NULL,
         data TEXT NOT NULL,
         updated_at INTEGER NOT NULL,
         PRIMARY KEY (collection, id)
       );
       CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
      true,
    );
  }

  async loadAll(): Promise<StoredRecord[]> {
    const res = await this.db.query("SELECT collection, id, data FROM records", []);
    return (res.values ?? []) as StoredRecord[];
  }

  async write(batch: { collection: string; id: string; data: string | null }[], opts: WriteOptions = {}) {
    if (!batch.length && !opts.clear) return;
    const now = Date.now();
    const set: { statement: string; values: unknown[] }[] = batch.map((b) =>
      b.data === null
        ? { statement: "DELETE FROM records WHERE collection = ? AND id = ?", values: [b.collection, b.id] }
        : {
            statement:
              "INSERT INTO records (collection, id, data, updated_at) VALUES (?, ?, ?, ?) " +
              "ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            values: [b.collection, b.id, b.data, now],
          },
    );
    // executeSet(…, true) runs every statement in one SQLite transaction, so the wipe and the
    // new rows commit together or not at all.
    if (opts.clear) set.unshift({ statement: "DELETE FROM records", values: [] });
    await this.db.executeSet(set, true);
  }

  async clear() {
    await this.db.execute("DELETE FROM records;", true);
  }

  async getMeta(key: string) {
    const res = await this.db.query("SELECT value FROM meta WHERE key = ?", [key]);
    return res.values?.[0]?.value ?? null;
  }

  async setMeta(key: string, value: string) {
    await this.db.run(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
      true,
    );
  }
}

// ---------------------------------------------------------------- IndexedDB (browser)
export class IndexedDbBackend implements StorageBackend {
  readonly kind = "indexeddb" as const;
  private db!: IDBDatabase;
  constructor(private name = DB_NAME, private factory: IDBFactory = indexedDB) {}

  init() {
    return new Promise<void>((resolve, reject) => {
      const req = this.factory.open(this.name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: ["collection", "id"] });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  private tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void) {
    return new Promise<T | undefined>((resolve, reject) => {
      const t = this.db.transaction(stores, mode);
      let result: T | undefined;
      const req = fn(t);
      if (req) req.onsuccess = () => (result = req.result);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async loadAll() {
    return ((await this.tx<StoredRecord[]>(["records"], "readonly", (t) => t.objectStore("records").getAll())) ?? []) as StoredRecord[];
  }

  async write(batch: { collection: string; id: string; data: string | null }[], opts: WriteOptions = {}) {
    if (!batch.length && !opts.clear) return;
    await this.tx(["records"], "readwrite", (t) => {
      const s = t.objectStore("records");
      if (opts.clear) s.clear();
      for (const b of batch) {
        if (b.data === null) s.delete([b.collection, b.id]);
        else s.put({ collection: b.collection, id: b.id, data: b.data });
      }
    });
  }

  async clear() {
    await this.tx(["records"], "readwrite", (t) => {
      t.objectStore("records").clear();
    });
  }

  async getMeta(key: string) {
    return ((await this.tx<string>(["meta"], "readonly", (t) => t.objectStore("meta").get(key))) ?? null) as string | null;
  }

  async setMeta(key: string, value: string) {
    await this.tx(["meta"], "readwrite", (t) => {
      t.objectStore("meta").put(value, key);
    });
  }
}

// ---------------------------------------------------------------- Memory (tests)
export class MemoryBackend implements StorageBackend {
  readonly kind = "memory" as const;
  records = new Map<string, StoredRecord>();
  meta = new Map<string, string>();
  async init() {}
  async loadAll() {
    return [...this.records.values()];
  }
  async write(batch: { collection: string; id: string; data: string | null }[], opts: WriteOptions = {}) {
    if (opts.clear) this.records.clear();
    for (const b of batch) {
      const k = `${b.collection}\u0000${b.id}`;
      if (b.data === null) this.records.delete(k);
      else this.records.set(k, { collection: b.collection, id: b.id, data: b.data });
    }
  }
  async clear() {
    this.records.clear();
  }
  async getMeta(key: string) {
    return this.meta.get(key) ?? null;
  }
  async setMeta(key: string, value: string) {
    this.meta.set(key, value);
  }
}

export function createDefaultBackend(): StorageBackend {
  if (Capacitor.isNativePlatform()) return new SqliteBackend();
  if (typeof indexedDB !== "undefined") return new IndexedDbBackend();
  return new MemoryBackend();
}
