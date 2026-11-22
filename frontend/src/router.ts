// Minimal hash router — works offline inside the Android WebView and with notification deep links.
import { useSyncExternalStore } from "react";

function current() {
  const h = window.location.hash.replace(/^#/, "");
  return h.startsWith("/") ? h : "/";
}

function subscribe(fn: () => void) {
  window.addEventListener("hashchange", fn);
  return () => window.removeEventListener("hashchange", fn);
}

export function useRoute() {
  const path = useSyncExternalStore(subscribe, current);
  const [pathname, query = ""] = path.split("?");
  return { path: pathname, parts: pathname.split("/").filter(Boolean), query: new URLSearchParams(query) };
}

export function go(path: string, opts: { replace?: boolean } = {}) {
  if (current() === path) return;
  if (opts.replace) window.location.replace("#" + path);
  else window.location.hash = path;
  window.scrollTo(0, 0);
}

let depth = 0;
window.addEventListener("hashchange", () => {
  depth = current() === "/" ? 0 : depth + 1;
});

/** Returns false when already at the root (caller may minimise the app). */
export function back(): boolean {
  if (current() === "/") return false;
  if (depth > 0 && window.history.length > 1) {
    depth = Math.max(0, depth - 2);
    window.history.back();
  } else go("/", { replace: true });
  return true;
}
