import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** 测试配置与构建配置分开：
 *  - `vite.config.ts` 管构建（Tauri 固定端口 1420 + watcher 忽略规则），**不动它**；
 *  - 本文件只管测试：jsdom 环境下渲染真实组件，验收**视图接线**（接线断了截图看不出来，
 *    断言能看出来）。
 *
 *  为什么不用「无头浏览器截图」做验收：本机 msedge headless 间歇性 0 字节（浏览器提前退出、
 *  多实例互锁），截图能当**人看效果**用，不能当**回归判据**用。 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
