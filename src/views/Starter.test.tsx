import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../types";
import { isSparse } from "../starmap/layout";
import { App } from "../App";

/** 起步层的接线验收（2026-09-15 主人判「没有可用性」后新增）。
 *
 *  演示数据是「有任务的正常态」，所以这里**造一个空总线快照**来验起步层——
 *  空态是最容易被漏测的一态：有数据时一切都对，没数据时界面对人毫无用处。
 *  验的是接线与写面（sendMessage 收到什么），像素仍归目视（截图自审）。 */

const NOW = Date.now();
const SPARSE: Snapshot = {
  busDir: "E:/alice/.dsh/bus",
  busOk: true,
  scannedAtMs: NOW,
  onlineCount: 1,
  nodes: [
    {
      id: "web-0",
      displayName: "本机主脑",
      online: true,
      ageMs: 1200,
      role: "主脑（队长）",
      profile: "web",
      harness: "DSH",
      pid: 111,
      port: 3080,
      workspace: "E:/alice",
      atMs: NOW,
      startedAt: NOW - 60_000,
    },
  ],
  messages: [],
  actions: [],
  tasks: [],
  steps: [],
  fingerprint: "sparse-1",
};

/** `vi.mock` 会被提升到文件顶部，工厂执行时普通 `const` 仍在 TDZ ⇒ 必须先 `vi.hoisted` 建 mock。 */
const { sendMessage, spawnRefNode } = vi.hoisted(() => ({
  sendMessage: vi.fn(async (_to: string, _text: string, _kind?: string) => "m-test-1"),
  spawnRefNode: vi.fn(async (displayName?: string) => ({
    nodeId: "host-wb-0",
    displayName: displayName ?? "参考节点",
    pid: 4242,
    atMs: 0,
    workdir: "E:/x/work",
  })),
}));

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    DEMO: false,
    busSnapshot: async () => SPARSE,
    onBusChanged: async () => () => undefined,
    dshStatus: async () => ({
      webOnline: true,
      port: 3080,
      url: "http://127.0.0.1:3080",
      workspace: "E:/alice",
      initScript: null,
      initScriptExists: true,
      onlineNodes: 1,
      detail: "ok",
    }),
    sendMessage,
    spawnRefNode,
    spawnedNodes: async () => [],
    stopRefNode: async () => "（测试）已停止",
    dshRecover: async () => "ok",
  };
});

describe("起步层（稀疏态）", () => {
  beforeEach(() => {
    window.location.hash = "";
    sendMessage.mockClear();
  });
  afterEach(() => cleanup());

  it("判据：只有主脑自己且无待办 = 稀疏；≥2 节点让位给星图", () => {
    const base = { online: 1, total: 1, busy: 0, openTasks: 0, failedTasks: 0, unverified: 0, retired: 13 };
    expect(isSparse(base)).toBe(true);
    // ≥2 个活节点 ⇒ 星图有两颗星可看，大卡片会让位（实测：第二个节点上线后新星被卡片挡住）
    expect(isSparse({ ...base, online: 2 })).toBe(false);
    expect(isSparse({ ...base, online: 3 })).toBe(false);
    expect(isSparse({ ...base, openTasks: 1 })).toBe(false);
  });

  it("空总线时主区出现起步层，并说清现状（不装作有活）", async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector(".starter")).toBeTruthy());
    expect(container.textContent).toContain("工作台还空着");
    expect(container.textContent).toContain("本机主脑");
    expect(container.textContent).toContain("投递任务");
  });

  it("投递任务走真写面：sendMessage(目标节点, 含判据的正文, 'task')", async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector(".starter")).toBeTruthy());
    const intent = container.querySelector(".starter .act-intent") as HTMLInputElement;
    const acc = container.querySelector(".starter .act-acc") as HTMLInputElement;
    fireEvent.change(intent, { target: { value: "把 README 补一节" } });
    fireEvent.change(acc, { target: { value: "文件里有该节且被引用" } });
    fireEvent.click(container.querySelector(".starter .btn.primary")!);
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    const call = sendMessage.mock.calls[0]!;
    expect(call[0]).toBe("web-0");
    expect(call[2]).toBe("task");
    expect(String(call[1])).toContain("把 README 补一节");
    expect(String(call[1])).toContain("判据：文件里有该节且被引用");
  });

  it("空态也保留「看全貌」出口（聚合 ≠ 隐藏）", async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector(".starter")).toBeTruthy());
    // 按**文本**定位，不按位置：起节点按钮加入后 `.starter-actions .btn` 不再唯一
    // （这正是原写法被本次改动打破的地方——测试要断言意图，不要断言顺序）
    const btns = Array.from(container.querySelectorAll(".starter-actions .btn"));
    const full = btns.find((b) => b.textContent?.includes("看总线全貌"));
    expect(full).toBeTruthy();
    fireEvent.click(full!);
    await waitFor(() => expect(container.textContent).toContain("节点名册"));
  });

  it("起节点按钮存在，且点击真的调 spawn_ref_node（写面之外唯一的进程启动点）", async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector(".starter")).toBeTruthy());
    const spawnBtn = Array.from(container.querySelectorAll(".starter-actions .btn")).find((b) =>
      b.textContent?.includes("起一个参考节点"),
    );
    expect(spawnBtn).toBeTruthy();
    fireEvent.click(spawnBtn!);
    await waitFor(() => expect(spawnRefNode).toHaveBeenCalledTimes(1));
  });
});
