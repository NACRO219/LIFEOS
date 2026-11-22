// LIFEOS store: an in-memory cache of every collection, written through to durable storage.
// All reads are synchronous (fast UI); writes update memory immediately and are persisted
// in order through a serialized queue. Each `transact` call is persisted as one atomic batch.

import { useSyncExternalStore } from "react";
import type { CollectionMap, CollectionName, Settings } from "../lib/types";
import { COLLECTIONS } from "../lib/types";
import type { StorageBackend } from "./backends";
import { defaultSettings, seedCollections } from "./seed";

export const SCHEMA_VERSION = 2;
export const BACKUP_FORMAT = "lifeos-backup";

type Data = { [K in CollectionName]: Map<string, CollectionMap[K]> };

export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  settings: Settings;
  collections: { [K in CollectionName]?: CollectionMap[K][] };
}

export class Store {
  private data = {} as Data;
  private settingsValue: Settings = defaultSettings();
  private kv = new Map<string, unknown>();
  private listeners = new Set<() => void>();
  private version = 0;
  private rev = 0; // bumps on every mutation (cache key)
  private queue: Promise<void> = Promise.resolve();
  private pending: { collection: string; id: string; data: string | null }[] | null = null;
  private snapshots = new Map<string, { v: number; value: unknown }>();
  errorHandler: (e: unknown) => void = (e) => console.error("LIFEOS storage error", e);
  ready = false;

  constructor(public backend: StorageBackend) {
    for (const c of COLLECTIONS) (this.data as Record<string, Map<string, unknown>>)[c] = new Map();
  }

  async init() {
    await this.backend.init();
    const rows = await this.backend.loadAll();
    for (const r of rows) {
      try {
        const doc = JSON.parse(r.data);
        if (r.collection === "_kv") this.kv.set(r.id, doc);
        else if (r.collection === "_settings") this.settingsValue = { ...defaultSettings(), ...doc, xp: { ...defaultSettings().xp, ...doc.xp } };
        else if ((COLLECTIONS as string[]).includes(r.collection)) (this.data as Record<string, Map<string, unknown>>)[r.collection].set(r.id, doc);
      } catch (e) {
        this.errorHandler(new Error(`Skipped a corrupted record (${r.collection}/${r.id}): ${String(e)}`));
      }
    }
    await this.migrate();
    this.ready = true;
    this.emit();
  }

  // ------------------------------------------------------------ migrations
  private async migrate() {
    const current = Number((await this.backend.getMeta("schema_version")) ?? 0);
    if (current >= SCHEMA_VERSION) return;
    this.transact(() => {
      if (current < 1) {
        // v1: first launch — seed reference data (CS roadmap, language profiles).
        const seed = seedCollections();
        for (const c of Object.keys(seed) as CollectionName[]) {
          for (const doc of seed[c] as { id: string }[]) if (!this.get(c, doc.id)) this.put(c, doc as never);
        }
        this.saveSettings({});
      }
      if (current < 2) {
        // v2: tasks gained `kind` and `recurrenceParentId`.
        for (const t of this.all("tasks")) {
          if (!t.kind || t.recurrenceParentId === undefined) this.put("tasks", { ...t, kind: t.kind ?? "task", recurrenceParentId: t.recurrenceParentId ?? null });
        }
      }
    });
    await this.flush();
    await this.backend.setMeta("schema_version", String(SCHEMA_VERSION));
  }

  // ------------------------------------------------------------ subscription
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.rev++;
    for (const l of this.listeners) l();
  }

  // ------------------------------------------------------------ reads
  all<K extends CollectionName>(c: K): CollectionMap[K][] {
    const key = `all:${c}`;
    const snap = this.snapshots.get(key);
    if (snap && snap.v === this.rev) return snap.value as CollectionMap[K][];
    const value = [...this.data[c].values()] as CollectionMap[K][];
    this.snapshots.set(key, { v: this.rev, value });
    return value;
  }
  get<K extends CollectionName>(c: K, id: string): CollectionMap[K] | undefined {
    return this.data[c].get(id) as CollectionMap[K] | undefined;
  }
  get settings(): Settings {
    return this.settingsValue;
  }

  // ------------------------------------------------------------ writes
  /** Group several writes into one atomic persisted batch and a single UI update. */
  transact<T>(fn: () => T): T {
    const outer = this.pending === null;
    if (outer) this.pending = [];
    try {
      const result = fn();
      if (outer) {
        const batch = this.pending!;
        this.pending = null;
        this.persist(batch);
        this.emit();
      }
      return result;
    } catch (e) {
      if (outer) this.pending = null;
      throw e;
    }
  }

  put<K extends CollectionName>(c: K, doc: CollectionMap[K]) {
    if (!doc || typeof (doc as { id?: unknown }).id !== "string") throw new Error(`Invalid ${c} record`);
    this.transact(() => {
      (this.data[c] as Map<string, CollectionMap[K]>).set(doc.id, doc);
      this.rev++;
      this.pending!.push({ collection: c, id: doc.id, data: JSON.stringify(doc) });
    });
  }

  update<K extends CollectionName>(c: K, id: string, patch: Partial<CollectionMap[K]>) {
    const existing = this.get(c, id);
    if (!existing) throw new Error(`${c} record not found`);
    this.put(c, { ...existing, ...patch, id } as CollectionMap[K]);
  }

  remove<K extends CollectionName>(c: K, id: string) {
    this.transact(() => {
      this.data[c].delete(id);
      this.rev++;
      this.pending!.push({ collection: c, id, data: null });
    });
  }

  saveSettings(patch: Partial<Settings>) {
    this.transact(() => {
      this.settingsValue = { ...this.settingsValue, ...patch };
      this.pending!.push({ collection: "_settings", id: "settings", data: JSON.stringify(this.settingsValue) });
    });
  }

  /** Small device-local values (e.g. the running focus timer). Not included in backups. */
  getKv<T>(key: string): T | null {
    return (this.kv.get(key) as T) ?? null;
  }
  setKv(key: string, value: unknown) {
    this.transact(() => {
      if (value === null || value === undefined) {
        this.kv.delete(key);
        this.pending!.push({ collection: "_kv", id: key, data: null });
      } else {
        this.kv.set(key, value);
        this.pending!.push({ collection: "_kv", id: key, data: JSON.stringify(value) });
      }
    });
  }

  private persist(batch: { collection: string; id: string; data: string | null }[]) {
    if (!batch.length) return;
    this.queue = this.queue.then(() => this.backend.write(batch)).catch((e) => this.errorHandler(e));
  }

  /** Resolves when every queued write has reached disk. */
  flush() {
    return this.queue;
  }

  // ------------------------------------------------------------ backup
  exportBackup(): BackupFile {
    const collections: BackupFile["collections"] = {};
    for (const c of COLLECTIONS) (collections as Record<string, unknown[]>)[c] = this.all(c);
    const { syncToken: _omit, ...settings } = this.settingsValue;
    return {
      format: BACKUP_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      settings: { ...settings, syncToken: "" },
      collections,
    };
  }

  /** Validate a backup without applying it. Returns counts per collection. */
  static validateBackup(raw: unknown): { ok: true; backup: BackupFile; counts: Record<string, number> } | { ok: false; error: string } {
    if (!raw || typeof raw !== "object") return { ok: false, error: "File is not a LIFEOS backup." };
    const b = raw as Partial<BackupFile>;
    if (b.format !== BACKUP_FORMAT) return { ok: false, error: "File is not a LIFEOS backup (missing format marker)." };
    if (typeof b.schemaVersion !== "number" || b.schemaVersion > SCHEMA_VERSION)
      return { ok: false, error: "This backup was made by a newer LIFEOS version. Update the app first." };
    if (!b.collections || typeof b.collections !== "object") return { ok: false, error: "Backup has no data." };
    const counts: Record<string, number> = {};
    for (const [name, docs] of Object.entries(b.collections)) {
      if (!(COLLECTIONS as string[]).includes(name)) continue;
      if (!Array.isArray(docs)) return { ok: false, error: `Section "${name}" is malformed.` };
      for (const d of docs) if (!d || typeof d !== "object" || typeof (d as { id?: unknown }).id !== "string") return { ok: false, error: `A record in "${name}" has no id.` };
      counts[name] = docs.length;
    }
    return { ok: true, backup: b as BackupFile, counts };
  }

  /** Replace all data with a validated backup (atomic). */
  async restoreBackup(backup: BackupFile) {
    await this.flush();
    const keepToken = this.settingsValue.syncToken;
    await this.backend.clear();
    for (const c of COLLECTIONS) this.data[c].clear();
    this.kv.clear();
    this.transact(() => {
      for (const c of COLLECTIONS) for (const d of (backup.collections[c] ?? []) as CollectionMap[typeof c][]) this.put(c, d);
      this.settingsValue = defaultSettings();
      this.saveSettings({ ...backup.settings, syncToken: keepToken, xp: { ...defaultSettings().xp, ...(backup.settings?.xp ?? {}) } });
    });
    await this.flush();
    if (backup.schemaVersion < SCHEMA_VERSION) {
      await this.backend.setMeta("schema_version", String(backup.schemaVersion));
      await this.migrate();
    }
  }

  async resetAll() {
    await this.flush();
    await this.backend.clear();
    for (const c of COLLECTIONS) this.data[c].clear();
    this.kv.clear();
    this.settingsValue = defaultSettings();
    await this.backend.setMeta("schema_version", "0");
    await this.migrate();
    this.emit();
  }
}

// ------------------------------------------------------------ singleton + hooks
let storeInstance: Store | null = null;
export function setStore(s: Store) {
  storeInstance = s;
}
export function store(): Store {
  if (!storeInstance) throw new Error("Store not initialised");
  return storeInstance;
}

/** Re-render when any data changes; returns the store for synchronous reads. */
export function useStore(): Store {
  const s = store();
  useSyncExternalStore(s.subscribe, s.getVersion);
  return s;
}

export function useCollection<K extends CollectionName>(c: K): CollectionMap[K][] {
  const s = useStore();
  return s.all(c);
}

export function useSettings(): Settings {
  return useStore().settings;
}
