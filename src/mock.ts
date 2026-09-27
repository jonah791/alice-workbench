/** 浏览器演示数据 —— 只在「开发模式且不在 Tauri 里」时启用（见 api.ts 的 DEMO 判定）。
 *
 *  纪律：
 *  1. **绝不在 Tauri 环境启用** —— 真实窗口里出现假数据比没有数据更危险。
 *  2. **不含任何真实本机信息**（路径用占位、id 是编的）—— 本文件会进公开仓库。
 *  3. 它只服务两件事：样式开发、UI 快速预览；**功能验收必须在真实 Tauri 窗口里做**。 */

import type { CommissionSnapshot } from "./types";

const WORKSPACE_PLACEHOLDER = "<workspace>";
let tick = 0;

/** 三条样本刻意覆盖**全部三种状态**（doing / delivered / needs-you），
 *  且产物里带**一个未知扩展名** —— 「未知类型降级为文件卡」是 I4 的判据（§7 C3），
 *  演示数据不覆盖它，真机上第一次遇到就会露馅。 */
export function mockCommissionSnapshot(): CommissionSnapshot {
  tick += 1;
  const base = Date.now();
  const art = (
    name: string,
    kind: "image" | "video" | "code" | "page" | "file",
    bytes: number,
    cid: string,
  ) => ({
    name,
    kind,
    path: `${WORKSPACE_PLACEHOLDER}\\.workbench\\artifacts\\${cid}\\${name}`,
    bytes,
  });
  return {
    dataDir: `${WORKSPACE_PLACEHOLDER}\\.workbench`,
    dataOk: true,
    scannedAtMs: base,
    commissions: [
      {
        id: "c-demo-1",
        text: "把这段演示视频转成 720p 并压到 10MB 以内",
        attachments: [],
        status: "delivered",
        atMs: base - 3_600_000,
        artifacts: [
          art("demo-720p.mp4", "video", 8_912_345, "c-demo-1"),
          art("still.png", "image", 421_003, "c-demo-1"),
          art("ffmpeg-log.txt", "file", 2_048, "c-demo-1"),
          art("report.weirdext", "file", 999, "c-demo-1"), // 未知扩展名 ⇒ 必须降级为文件卡
        ],
        request: null,
      },
      {
        id: "c-demo-2",
        text: "查一下这个报错是谁引起的",
        attachments: ["stack.log"],
        status: "needs-you",
        atMs: base - 600_000,
        artifacts: [],
        request: {
          what: "需要你确认：要不要动生产库的只读账号",
          whyOnlyYou: "那是你的凭据，我不持有也不该持有",
          atMs: base - 540_000,
        },
      },
      {
        id: "c-demo-3",
        text: "把这周的会议纪要汇总成一页",
        attachments: [],
        status: "doing",
        atMs: base - 120_000,
        artifacts: [],
        request: null,
      },
    ],
    fingerprint: `mock-c-${tick}`,
  };
}
