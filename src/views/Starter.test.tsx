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
const { sendMessage } = vi.hoisted(() => ({
  sendMessage: vi.fn(async (_to: string, _text: string, _kind?: string) => "m-test-1"),
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
    dshRecover: async () => "ok",
  };
});

describe("起步层（稀疏态）", () => {
  beforeEach(() => {
    window.location.hash = "";
    sendMessage.mockClear();
  });
  afterEach(() => cleanup());

  it("判据：在线 ≤2 且无待办 = 稀疏；有活要干就不算", () => {
    const base = { online: 1, total: 1, busy: 0, openTasks: 0, failedTasks: 0, unverified: 0, retired: 13 };
    expect(isSparse(base)).toBe(true);
    expect(isSparse({ ...base, online: 2 })).toBe(true);
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
    fireEvent.click(container.querySelector(".starter-actions .btn")!);
    await waitFor(() => expect(container.textContent).toContain("节点名册"));
  });
});
