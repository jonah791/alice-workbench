/** 浏览器演示数据 —— 只在「开发模式且不在 Tauri 里」时启用（见 api.ts 的 DEMO 判定）。
 *
 *  纪律：
 *  1. **绝不在 Tauri 环境启用**——真实窗口里出现假数据比没有数据更危险。
 *  2. **不含任何真实本机信息**（路径用占位、id 是编的）——本文件会进公开仓库。
 *  3. 它只服务两件事：样式开发、UI 快速预览；**功能验收必须在真实 Tauri 窗口里做**。 */

import type { DshStatus, Snapshot } from "./types";

const WORKSPACE_PLACEHOLDER = "<workspace>";
let tick = 0;

export function mockSnapshot(): Snapshot {
  tick += 1;
  const base = Date.now();
  return {
    busDir: `<USERPROFILE>\\.dsh-cluster`,
    busOk: true,
    scannedAtMs: base,
    onlineCount: 2,
    nodes: [
      {
        id: "DEMO-host-web-0-31116",
        displayName: "web-0",
        online: true,
        ageMs: 900,
        role: "主脑",
        profile: "web",
        harness: null,
        pid: 31116,
        host: "DEMO-host",
        port: 3080,
        workspace: WORKSPACE_PLACEHOLDER,
        atMs: base - 900,
        startedAt: base - 3_600_000,
      },
      {
        id: "probe-a-1200",
        displayName: "probe-a-1200",
        online: true,
        ageMs: 400,
        role: "探针",
        profile: "probe",
        harness: "probe",
        pid: 1200,
        host: "DEMO-host",
        port: null,
        workspace: WORKSPACE_PLACEHOLDER,
        atMs: base - 400,
        startedAt: base - 120_000,
      },
      {
        id: "DEMO-host-web-0",
        displayName: "web-0",
        online: false,
        ageMs: 2_640_000,
        role: "主脑",
        profile: "web",
        harness: null,
        pid: 28772,
        host: "DEMO-host",
        port: null,
        workspace: WORKSPACE_PLACEHOLDER,
        atMs: base - 2_640_000,
        startedAt: base - 2_700_000,
      },
    ],
    messages: [
      {
        id: "m-demo-1",
        from: "DEMO-host-web-0-31116",
        to: "probe-a-1200",
        kind: "task",
        text: "示范任务：把这段文本落盘到 logs/ 并回结果。",
        createdAt: base - 12_000,
        replyTo: null,
        delivered: true,
        holder: "probe-a-1200",
      },
      {
        id: "m-demo-2",
        from: "owner",
        to: "DEMO-host-web-0-31116",
        kind: "chat",
        text: "（来自工作台的消息示范）",
        createdAt: base - 4_000,
        replyTo: null,
        delivered: false,
        holder: "DEMO-host-web-0-31116",
      },
    ],
    actions: [
      { atMs: base - 1_400, phase: "sent", node: "DEMO-host-web-0-31116", id: "m-demo-2", kind: "chat", to: "probe-a-1200", why: null, chars: 92, raw: "{}" },
      { atMs: base - 3_200, phase: "delivered", node: "DEMO-host-web-0-31116", id: "m-demo-1", kind: "task", to: null, why: "未指定锚点 → 投最近有真实用户输入的顶层会话", chars: 53, raw: "{}" },
      { atMs: base - 6_000, phase: "no-target", node: "DEMO-host-web-0-31116", id: "m-demo-0", kind: null, to: null, why: "共 0 个会话，但无顶层（用户）会话——不投递", chars: null, raw: "{}" },
      { atMs: base - 9_000, phase: "startup-poll", node: "DEMO-host-web-0-31116", id: null, kind: null, to: null, why: null, chars: 1, raw: "{}" },
    ],
    fingerprint: `mock-${tick}`,
  };
}

export function mockDshStatus(): DshStatus {
  return {
    webOnline: true,
    port: 3080,
    url: "http://127.0.0.1:3080",
    workspace: WORKSPACE_PLACEHOLDER,
    initScript: `${WORKSPACE_PLACEHOLDER}\\.dsh\\init-dsh.ps1`,
    initScriptExists: true,
    onlineNodes: 2,
    detail: "演示模式：真实窗口下这里显示实际探测结果",
  };
}
