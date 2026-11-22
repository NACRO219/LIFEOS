// Android platform integration: hardware back button, system bar styling, splash screen,
// keyboard, haptics and app lifecycle.
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();

// ---------------------------------------------------------------- back button
// Overlays (sheets, dialogs) register a handler; the most recent one handles "back" first.
const backHandlers: (() => void)[] = [];
export function pushBackHandler(fn: () => void) {
  backHandlers.push(fn);
  return () => {
    const i = backHandlers.lastIndexOf(fn);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

export async function initPlatform(opts: { onBack: () => boolean; onResume: () => void }) {
  if (!isNative()) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") opts.onResume();
    });
    return;
  }
  const { App } = await import("@capacitor/app");
  await App.addListener("backButton", () => {
    const top = backHandlers[backHandlers.length - 1];
    if (top) {
      top();
      return;
    }
    if (!opts.onBack()) void App.minimizeApp(); // at the root screen: behave like a native app
  });
  await App.addListener("resume", () => opts.onResume());
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => undefined);
  } catch {
    /* keyboard plugin optional */
  }
}

export async function hideSplash() {
  if (!isNative()) return;
  const { SplashScreen } = await import("@capacitor/splash-screen");
  await SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => undefined);
}

export async function applySystemBars(dark: boolean) {
  if (!isNative()) return;
  // Style.Dark = light icons for dark backgrounds.
  await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
}

export async function haptic(kind: "light" | "success" = "light") {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "success") await Haptics.notification({ type: NotificationType.Success });
    else await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* ignore */
  }
}

export async function openExternal(url: string) {
  // Android WebView hands http(s) links opened with _blank to the system browser / installed app.
  window.open(url, "_blank", "noopener");
}
