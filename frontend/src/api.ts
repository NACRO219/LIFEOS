// Optional backup sync with the LIFEOS FastAPI server. LIFEOS works fully without it.
// On Android, requests go through Capacitor's native HTTP so a server on your home network works.
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { BackupFile } from "./db/store";

async function request<T>(base: string, token: string, path: string, method: "GET" | "PUT", body?: unknown): Promise<T> {
  const url = base.replace(/\/+$/, "") + path;
  if (!/^https?:\/\//i.test(url)) throw new Error("Server URL must start with http:// or https://");
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({ url, method, headers, data: body, connectTimeout: 10000, readTimeout: 30000 });
    if (res.status >= 400) throw new Error(errorText(res.status, res.data));
    return res.data as T;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(errorText(res.status, data));
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

function errorText(status: number, data: unknown) {
  const detail = (data as { detail?: unknown })?.detail;
  if (status === 401) return "The server rejected the sync token.";
  if (status === 503) return "Sync is disabled on the server (LIFEOS_SYNC_TOKEN not set).";
  if (status === 404) return "No backup stored on the server yet.";
  return typeof detail === "string" ? detail : `Server error (${status})`;
}

export const syncApi = {
  health: (base: string) => request<{ status: string; sync_enabled: boolean }>(base, "", "/api/health", "GET"),
  upload: (base: string, token: string, backup: BackupFile) => request<{ ok: boolean; stored_at: string; size: number }>(base, token, "/api/backup", "PUT", backup),
  download: (base: string, token: string) => request<BackupFile>(base, token, "/api/backup", "GET"),
};
