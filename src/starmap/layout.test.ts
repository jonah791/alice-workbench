import { describe, expect, it } from "vitest";
import type { ActionEvent, MessageInfo, NodeInfo, StepEvent, TaskInfo } from "../types";
import { BUSY_WINDOW_MS, R_OFFLINE, R_ONLINE, SAT_ORBIT_GAP, buildPulses, buildStarMap, hashUnit, type StarMapInput } from "./layout";

/** 星图布局的聚焦测试。选判据的标准：**能证伪「星图看起来对但其实错」的那些**——
 *  位置确定性（否则星星每 2s 跳一次）、坐标有限性（NaN 会让星直接消失）、
 *  环位与文字纪律（离线星不许带名字）、卫星归属（任务挂错星 = 因果错）。 */

const NOW = 1_789_400_000_000;

const mkNode = (over: Partial<NodeInfo> & { id: string }): NodeInfo => ({
  displayName: over.id,
  online: true,
  ageMs: 900,
  ...over,
});

const baseNodes: NodeInfo[] = [
  mkNode({ id: "host-web-0-31116", displayName: "web-0", role: "主脑", profile: "web", port: 3080 }),
  mkNode({ id: "probe-a-1200", displayName: "probe-a", role: "探针", harness: "probe" }),
  mkNode({ id: "ghost-1", displayName: "ghost", online: false, ageMs: 2_640_000 }),
];

const mkTask = (over: Partial<TaskInfo> & { taskId: string }): TaskInfo => ({
  intentRef: "示范任务",
  acceptance: "文件存在",
  status: "running",
  assignee: "probe-a-1200",
  createdAt: NOW - 30_000,
  lastProgressAt: NOW - 2_000,
  evidenceCount: 1,
  unverifiedCount: 0,
  ...over,
});

const mkStep = (over: Partial<StepEvent> & { atMs: number }): StepEvent => ({
  actionId: "a1",
  stage: "stage",
  step: 1,
  total: 2,
  humanText: "第 1/2 步",
  ...over,
});

const mkMsg = (over: Partial<MessageInfo> & { id: string }): MessageInfo => ({
  from: "owner",
  to: "probe-a-1200",
  kind: "chat",
  text: "hi",
  createdAt: NOW - 1_000,
  delivered: true,
  holder: "probe-a-1200",
  ...over,
});

const input = (over: Partial<StarMapInput> = {}): StarMapInput => ({
  nodes: baseNodes,
  tasks: [],
  messages: [],
  actions: [],
  steps: [],
  now: NOW,
  ...over,
});

describe("星图布局", () => {
  it("确定性：同一输入两次构建逐字节相同（星位不许漂）", () => {
    const a = buildStarMap(input({ tasks: [mkTask({ taskId: "t-1" }), mkTask({ taskId: "t-2" })], messages: [mkMsg({ id: "m1" })] }));
    const b = buildStarMap(input({ tasks: [mkTask({ taskId: "t-1" }), mkTask({ taskId: "t-2" })], messages: [mkMsg({ id: "m1" })] }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("坐标有限：所有天体与光弧坐标都不是 NaN/Infinity", () => {
    const m = buildStarMap(
      input({
        tasks: [mkTask({ taskId: "t-1" }), mkTask({ taskId: "t-2", assignee: "不存在的节点" })],
        messages: [mkMsg({ id: "m1" }), mkMsg({ id: "m2", from: "probe-a-1200", to: "host-web-0-31116" })],
        steps: [mkStep({ atMs: NOW - 1_000, node: "probe-a-1200" })],
      }),
    );
    for (const s of [...m.stars, ...m.satellites]) expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
    for (const l of m.links) {
      expect([l.x1, l.y1, l.x2, l.y2, l.mx, l.my].every(Number.isFinite)).toBe(true);
    }
  });

  it("中央恒星：role 含「主脑」者居中，且是 core 态", () => {
    const m = buildStarMap(input());
    const core = m.stars.find((s) => s.state === "core");
    expect(core?.id).toBe("host-web-0-31116");
    expect(core?.x).toBe(m.cx);
    expect(core?.y).toBe(m.cy);
    expect(m.coreId).toBe("host-web-0-31116");
  });

  it("环位与文字纪律：在线在内环、离线在外环，且离线星不带名字", () => {
    const m = buildStarMap(input());
    const online = m.stars.find((s) => s.id === "probe-a-1200");
    const offline = m.stars.find((s) => s.id === "ghost-1");
    // 断言用导出的常量：测的是**关系**（在线在内环/离线在外环）而不是某个魔法数
    expect(online?.radius).toBe(R_ONLINE);
    expect(offline?.radius).toBe(R_OFFLINE);
    expect(online?.label).toBe("probe-a");
    expect(offline?.label).toBeNull(); // 外环不许变成文字垃圾场
  });

  it("卫星归属：挂在 assignee 星周围；assignee 不存在 → 挂中央恒星", () => {
    const m = buildStarMap(
      input({ tasks: [mkTask({ taskId: "t-1" }), mkTask({ taskId: "t-2", assignee: "ghost-node" })] }),
    );
    const t1 = m.satellites.find((s) => s.taskId === "t-1")!;
    const t2 = m.satellites.find((s) => s.taskId === "t-2")!;
    const probe = m.stars.find((s) => s.id === "probe-a-1200")!;
    const core = m.stars.find((s) => s.state === "core")!;
    expect(t1.ownerId).toBe("probe-a-1200");
    expect(Math.hypot(t1.x - probe.x, t1.y - probe.y)).toBeCloseTo(probe.r + SAT_ORBIT_GAP, 1);
    expect(t2.ownerId).toBe(core.id);
    expect(Math.hypot(t2.x - core.x, t2.y - core.y)).toBeCloseTo(core.r + SAT_ORBIT_GAP, 1);
  });

  it("忙碌判定：窗口内有行为事件才是忙碌（窗口边界不给错判）", () => {
    const fresh = buildStarMap(input({ steps: [mkStep({ atMs: NOW - 1_000, node: "probe-a-1200" })] }));
    const stale = buildStarMap(input({ steps: [mkStep({ atMs: NOW - BUSY_WINDOW_MS - 1, node: "probe-a-1200" })] }));
    expect(fresh.stars.find((s) => s.id === "probe-a-1200")?.state).toBe("busy");
    expect(stale.stars.find((s) => s.id === "probe-a-1200")?.state).toBe("online");
  });

  it("失败任务把宿主星标成异常态（品红），并且统计口径一致", () => {
    const m = buildStarMap(input({ tasks: [mkTask({ taskId: "t-1", status: "failed" }), mkTask({ taskId: "t-2" })] }));
    expect(m.stars.find((s) => s.id === "probe-a-1200")?.state).toBe("fault");
    expect(m.stats.failedTasks).toBe(1);
    expect(m.stats.openTasks).toBe(1); // t-1 failed 不算「未收尾」
  });

  it("光弧：owner 解析为中央恒星；自环跳过；数量封顶 24", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      mkMsg({ id: `m${i}`, from: "owner", to: "probe-a-1200", createdAt: NOW - i * 1000 }),
    );
    const m = buildStarMap(input({ messages: [...many, mkMsg({ id: "loop", from: "probe-a-1200", to: "probe-a-1200" })] }));
    expect(m.links.length).toBe(24);
    const core = m.stars.find((s) => s.state === "core")!;
    expect(m.links[0].x1).toBeCloseTo(core.x, 5); // owner 端落在中央恒星
    expect(m.links.every((l) => l.id !== "loop")).toBe(true);
  });

  it("空总线不抛：无节点 → 无天体，统计全 0", () => {
    const m = buildStarMap(input({ nodes: [] }));
    expect(m.stars).toHaveLength(0);
    expect(m.satellites).toHaveLength(0);
    expect(m.stats).toEqual({ online: 0, total: 0, busy: 0, openTasks: 0, failedTasks: 0, unverified: 0 });
  });

  it("hashUnit 稳定且落在 [0,1)", () => {
    expect(hashUnit("node-a")).toBe(hashUnit("node-a"));
    expect(hashUnit("node-a")).not.toBe(hashUnit("node-b"));
    for (const s of ["", "a", "LAPTOP-BF4IAPLM-web-0-31116", "t-mu1gvjpy-d6sp9j"]) {
      const v = hashUnit(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("脉冲条", () => {
  const mkAction = (over: Partial<ActionEvent> & { atMs: number }): ActionEvent => ({
    phase: "sent",
    raw: "{}",
    ...over,
  });

  it("时间正序 + 截断到 limit（最新的一定在右端）", () => {
    const actions = Array.from({ length: 90 }, (_, i) => mkAction({ atMs: NOW - (90 - i) * 100, phase: "sent" }));
    const pulses = buildPulses(actions, [], 64);
    expect(pulses).toHaveLength(64);
    for (let i = 1; i < pulses.length; i += 1) expect(pulses[i].atMs).toBeGreaterThanOrEqual(pulses[i - 1].atMs);
    expect(pulses[pulses.length - 1].atMs).toBe(NOW - 100);
  });

  it("相位着色：failed→err / done→ok / no-target→warn / delivered→ok", () => {
    const pulses = buildPulses(
      [
        mkAction({ atMs: NOW - 400, phase: "no-target" }),
        mkAction({ atMs: NOW - 300, phase: "delivered" }),
      ],
      [mkStep({ atMs: NOW - 200, stage: "failed", node: "probe-a-1200" }), mkStep({ atMs: NOW - 100, stage: "done" })],
    );
    expect(pulses.map((p) => p.tone)).toEqual(["warn", "ok", "err", "ok"]);
    expect(pulses.map((p) => p.origin)).toEqual(["action", "action", "step", "step"]);
  });
});
