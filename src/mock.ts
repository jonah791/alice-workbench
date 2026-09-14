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
    tasks: [
      {
        taskId: "t-demo-0001-a1b2c3",
        shortId: "a1b2c3",
        intentRef: "示范：把一段文本落盘并回报证据",
        acceptance: "文件存在且内容含「示范」；sha256 可被主脑独立复现",
        grade: "L1",
        status: "running",
        assignee: "probe-a-1200",
        createdAt: base - 30_000,
        lastProgressAt: base - 2_000,
        evidenceCount: 2,
        unverifiedCount: 0,
        summary: null,
        verdictPass: null,
        verdictMethod: null,
      },
      {
        taskId: "t-demo-0002-d4e5f6",
        shortId: "d4e5f6",
        intentRef: "示范：一条已验收完成、但留有未验证项的任务",
        acceptance: "产物 sha256 与主脑独立复算一致",
        grade: "L1",
        status: "done",
        assignee: "probe-a-1200",
        createdAt: base - 600_000,
        lastProgressAt: base - 540_000,
        evidenceCount: 3,
        unverifiedCount: 1,
        summary: "完成 3 步，产出 3 条证据",
        verdictPass: true,
        verdictMethod: "复现证据（sha256 独立复算一致）",
      },
    ],
    steps: [
      { atMs: base - 30_000, actionId: "a-demo-1", node: "probe-a-1200", stage: "start", step: 0, total: 3, humanText: "收到任务 t-demo-0001-a1b2c3，拆解为 3 步", taskId: "t-demo-0001-a1b2c3" },
      { atMs: base - 29_800, actionId: "a-demo-1", node: "probe-a-1200", stage: "stage", step: 1, total: 3, humanText: "第 1/3 步：创建目录 demo", taskId: "t-demo-0001-a1b2c3" },
      { atMs: base - 29_600, actionId: "a-demo-1", node: "probe-a-1200", stage: "stage", step: 2, total: 3, humanText: "第 2/3 步：写文件 demo/ok.txt", taskId: "t-demo-0001-a1b2c3" },
      { atMs: base - 29_400, actionId: "a-demo-1", node: "probe-a-1200", stage: "stage", step: 3, total: 3, humanText: "第 3/3 步：计算摘要 demo/ok.txt", taskId: "t-demo-0001-a1b2c3" },
      { atMs: base - 600_000, actionId: "a-demo-2", node: "probe-a-1200", stage: "start", step: 0, total: 3, humanText: "收到任务 t-demo-0002-d4e5f6，拆解为 3 步", taskId: "t-demo-0002-d4e5f6" },
      { atMs: base - 540_000, actionId: "a-demo-2", node: "probe-a-1200", stage: "done", step: 3, total: 3, humanText: "任务完成，3 条证据", taskId: "t-demo-0002-d4e5f6" },
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
