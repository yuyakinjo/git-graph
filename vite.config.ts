import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri 前提の設定: 固定ポート・HMR ポート・ソースマップ
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "safari15",
    sourcemap: false,
  },
});
