import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 固定端口 + 不清屏 + 忽略 src-tauri 变更（避免 Rust 改动触发前端重启）
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
});
