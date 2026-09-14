import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 固定端口 + 不清屏 + 忽略非源码变更（避免 Rust 改动触发前端重启）
//
// watch.ignored 里的两类模式是**踩坑换来的**（2026-09-14 实测）：
//   1. `**/src-tauri/**` —— Rust 编译产物变化不该重启前端；
//   2. `**/*.tmpdir/**` 与 `**/*.tmp` —— 原子写工具（编辑器/git/帧工具）会在项目内临时建目录再改名，
//      watcher 追进去时文件已被锁或删除，Node 直接抛 EBUSY **杀死 dev server**
//      （实测症状：vite ready 后数秒退出，浏览器只剩空白页）。
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**", "**/target/**", "**/dist/**", "**/*.tmpdir/**", "**/*.tmp"],
    },
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
});
