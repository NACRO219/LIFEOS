// Backup export (share sheet on Android, download in browser) and import.
import { Capacitor } from "@capacitor/core";
import type { BackupFile } from "../db/store";
import { t } from "../i18n";
import { todayISO } from "../lib/date";

export async function exportBackupFile(backup: BackupFile): Promise<string> {
  const json = JSON.stringify(backup, null, 2);
  const name = `lifeos-backup-${todayISO(new Date(backup.exportedAt))}.json`;
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    // Documents/LIFEOS on Android 11+ needs no storage permission for app-created files.
    const written = await Filesystem.writeFile({ path: `LIFEOS/${name}`, data: json, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true }).catch(async () =>
      Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 }),
    );
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: t("files.shareTitle"), text: t("files.shareText"), url: written.uri, dialogTitle: t("files.shareDialog") });
    } catch {
      /* user closed the share sheet — the file is still saved */
    }
    return written.uri.includes("Documents") ? t("files.savedDocs", { name }) : t("files.saved", { name });
  }
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return t("files.downloaded", { name });
}

/** Reads a user-picked file (Android's file picker works through <input type="file">). */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 50 * 1024 * 1024) return reject(new Error(t("files.tooLarge")));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not read file"));
    r.readAsText(file);
  });
}
