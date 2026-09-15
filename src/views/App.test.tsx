import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../App";

/** 视图接线的 in-process 验收（jsdom + 真实组件 + 演示数据）。
 *
 *  验的是**接线**而不是像素：星图/列表的切换、点星与点卫星是否真的把状态送到右栏。
 *  这些断点在 v0.2 改版里最容易悄悄断掉（组件都在，就是没人接）。
 *  像素效果（配色、构图）仍归主人目视——见 `docs/DESIGN.md`。 */

const setHash = (h: string) => {
  window.location.hash = h;
};

describe("工作台视图接线", () => {
  beforeEach(() => setHash(""));
  afterEach(() => cleanup());

  it("默认进星图：渲染 svg.starmap，且不出现列表视图的名册", async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector("svg.starmap")).toBeTruthy());
    // 演示数据有 2 在线 + 1 离线节点 ⇒ 天体应被算出来
    expect(container.querySelectorAll("g.star").length).toBeGreaterThan(2);
    expect(container.textContent).not.toContain("节点名册");
  });

  it("离线星遵守文字纪律：不渲染名字标签", async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector("g.star.offline")).toBeTruthy());
    const off = container.querySelector("g.star.offline")!;
    expect(off.querySelector("text.label")).toBeNull();
    const on = container.querySelector("g.star.online, g.star.core")!;
    expect(on.querySelector("text.label")).toBeTruthy();
  });

  it("#view=list 切到列表：出现名册与任务板，且星图不渲染", async () => {
    setHash("#view=list");
    const { container } = render(<App />);
    await waitFor(() => expect(container.textContent).toContain("节点名册"));
    expect(container.querySelector("svg.starmap")).toBeNull();
    expect(container.textContent).toContain("未收尾"); // 任务板摘要（P1-1 能力仍在）
  });

  it("点星 → 右栏出节点详情（含发消息入口）", async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector("g.star.online")).toBeTruthy());
    fireEvent.click(container.querySelector("g.star.online")!);
    await waitFor(() => expect(container.textContent).toContain("节点详情"));
    expect(container.textContent).toContain("节点 id");
    expect(container.textContent).toContain("投递");
  });

  it("点卫星 → 右栏出任务详情（判据 / 裁决 / 执行过程齐备）", async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector("g.sat")).toBeTruthy());
    fireEvent.click(container.querySelector("g.sat")!);
    await waitFor(() => expect(container.textContent).toContain("任务详情"));
    expect(container.textContent).toContain("判据");
    expect(container.textContent).toContain("裁决");
    expect(container.textContent).toContain("执行过程");
  });

  it("深链可直达：#task=… 打开即选中该任务；点空白回到概览", async () => {
    setHash("#task=t-demo-0001-a1b2c3");
    const { container } = render(<App />);
    await waitFor(() => expect(container.textContent).toContain("任务详情"));
    fireEvent.click(container.querySelector("rect.map-bg")!);
    await waitFor(() => expect(container.textContent).toContain("概览"));
  });

  it("未验证项在星图上可见（琥珀虚环）——不许被静默略过", async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector("g.sat")).toBeTruthy());
    // 演示数据里 t-demo-0002 有 1 个未验证项 ⇒ 应至少有一颗卫星带虚环
    expect(container.querySelectorAll("circle.unverified").length).toBeGreaterThan(0);
  });

  it("脉冲条默认折叠成刻度，点开才出完整事件流（文字退到第二层）", async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelectorAll("i.tick").length).toBeGreaterThan(0));
    expect(container.querySelector(".pulse-full")).toBeNull(); // 折叠态：没有正文面板
    fireEvent.click(container.querySelector(".pulse-toggle")!);
    await waitFor(() => expect(container.querySelector(".pulse-full")).toBeTruthy());
    expect(container.querySelector(".pulse-full")!.textContent).toContain("实时行为流");
  });
});
