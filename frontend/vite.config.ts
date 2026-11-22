import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // relative asset paths: required inside the Android WebView
  build: { target: "es2020", sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
