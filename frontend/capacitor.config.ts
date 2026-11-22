import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.lifeos.app",
  appName: "LIFEOS",
  webDir: "dist",
  android: {
    // Release builds must not be debuggable from Chrome; debug builds are.
    webContentsDebuggingEnabled: undefined,
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false, // hidden by the app once the database is open
      backgroundColor: "#4f6bff",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_lifeos",
      iconColor: "#4F6BFF",
    },
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
};

export default config;
