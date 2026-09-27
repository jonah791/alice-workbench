/** 委托台的验收测试 —— 对应 `docs/semantic.md` §7 的 C 表。
 *
 *  为什么这些判据要写成断言、而不是靠截图：接线断了截图看不出来
 *  （`vitest.config.ts` 顶部已记过这条教训）。
 *
 *  这里测的三条是宪法的验收面：
 *  - C2 「入口是一个框」—— 空内容不可提交、提交后清空、失败要响；
 *  - C3 「产物是通用容器」—— 未知类型必须降级而不是丢卡片（I4）；
 *  - C4 「打扰有门槛」—— `needs-you` 必须自带「做什么 + 为什么只有你能做」。 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactCard, humanSize } from "./components/ArtifactCard";
import { Commissions, humanAgo } from "./views/Commissions";
import { Composer } from "./views/Composer";
import type { Artifact, Commission } from "./types";

/* RTL 的自动清理依赖 vitest `globals: true`，而本仓是**显式 import 风格**（没开 globals）
   ⇒ 必须自己 afterEach(cleanup)，否则前一个 render 的 DOM 会留到下一个用例里，
   表现为 `Found multiple elements with ...`（首版四条失败全是这一个原因）。 */
afterEach(() => cleanup());

const c = (over: Partial<Commission>): Commission => ({
  id: "c1",
  text: "示例委托",
  attachments: [],
  status: "doing",
  atMs: Date.now(),
  artifacts: [],
  request: null,
  ...over,
});

const art = (over: Partial<Artifact>): Artifact => ({
  name: "x.bin",
  kind: "file",
  path: "X:\\wb\\x.bin",
  bytes: 1024,
  ...over,
});

/* ── C3 产物是通用容器 ─────────────────────────────────────────────── */

describe("C3 · 产物卡", () => {
  it("未知扩展名的产物照常渲染成卡片（降级，不是丢弃）", () => {
    render(<ArtifactCard a={art({ name: "report.weirdext", kind: "file" })} />);
    expect(screen.getByText("report.weirdext")).toBeTruthy();
  });

  it("四种已知类型各给中文标签", () => {
    const cases: Array<[Artifact["kind"], string]> = [
      ["image", "图片"],
      ["video", "视频"],
      ["code", "代码"],
      ["page", "网页"],
    ];
    for (const [kind, label] of cases) {
      const { unmount } = render(<ArtifactCard a={art({ kind, name: `f.${kind}` })} />);
      expect(screen.getByText(new RegExp(label))).toBeTruthy();
      unmount();
    }
  });

  it("体积说人话；0 与 NaN 不显示 NaN", () => {
    expect(humanSize(999)).toBe("999 B");
    expect(humanSize(2048)).toBe("2.0 KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(humanSize(0)).toBe("—");
    expect(humanSize(Number.NaN)).toBe("—");
  });
});

/* ── C2 输入即委托 ─────────────────────────────────────────────────── */

describe("C2 · 输入框", () => {
  it("空内容时提交按钮不可用（不会发出空委托）", () => {
    render(<Composer onSubmit={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("提交后回调拿到文本，且输入框被清空", async () => {
    const seen: string[] = [];
    const onSubmit = vi.fn(async (t: string) => {
      seen.push(t);
    });
    render(<Composer onSubmit={onSubmit} />);
    const box = screen.getByPlaceholderText(/要我做点什么/) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "  帮我把这周的纪要汇总  " } });
    fireEvent.click(screen.getByRole("button"));
    // 等微任务：onSubmit 是 async
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual(["帮我把这周的纪要汇总"]); // 已 trim
    expect(box.value).toBe(""); // 发出去后清空
  });

  it("提交失败要响，不许静默（否者主人以为发出去了）", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("磁盘满了");
    });
    render(<Composer onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText(/要我做点什么/), { target: { value: "干活" } });
    fireEvent.click(screen.getByRole("button"));
    await Promise.resolve();
    await Promise.resolve();
    expect(await screen.findByText(/磁盘满了/)).toBeTruthy();
  });
});

/* ── C4 打扰有门槛 ─────────────────────────────────────────────────── */

describe("C4 · 委托列表与三种标记", () => {
  it("三种状态各渲染自己的标记（且没有第四种）", () => {
    const { unmount } = render(
      <Commissions
        items={[
          c({ id: "a", status: "doing" }),
          c({ id: "b", status: "delivered", artifacts: [art({})] }),
          c({ id: "c", status: "needs-you", request: { what: "给个 key", whyOnlyYou: "只有你有", atMs: 1 } }),
        ]}
        selectedId={null}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText("·")).toBeTruthy();
    expect(screen.getByText("✓")).toBeTruthy();
    expect(screen.getByText("⚠")).toBeTruthy();
    unmount();
  });

  it("needs-you 必须同时给出「做什么」与「为什么只有你」", () => {
    render(
      <Commissions
        items={[
          c({
            id: "n1",
            status: "needs-you",
            request: { what: "要不要动生产库的只读账号", whyOnlyYou: "那是你的凭据", atMs: 1 },
          }),
        ]}
        selectedId={null}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText("要不要动生产库的只读账号")).toBeTruthy();
    expect(screen.getByText(/那是你的凭据/)).toBeTruthy();
  });

  it("doing / delivered 不渲染请求块 —— 请求只在 needs-you 出现（它是打扰，不是状态）", () => {
    render(
      <Commissions
        items={[
          // 即便数据里带着 request，非 needs-you 也不该显示
          c({ id: "d1", status: "doing", request: { what: "不该显示", whyOnlyYou: "也不该", atMs: 1 } }),
        ]}
        selectedId={null}
        onSelect={() => undefined}
      />,
    );
    expect(screen.queryByText("不该显示")).toBeNull();
  });

  it("空列表给引导语，不是一片空白", () => {
    render(<Commissions items={[]} selectedId={null} onSelect={() => undefined} />);
    expect(screen.getByText(/还没有委托/)).toBeTruthy();
  });

  it("点一条委托会把 id 交给上层", () => {
    const picked: string[] = [];
    render(
      <Commissions
        items={[c({ id: "click-me" })]}
        selectedId={null}
        onSelect={(id) => picked.push(id)}
      />,
    );
    fireEvent.click(screen.getByText("示例委托"));
    expect(picked).toEqual(["click-me"]);
  });

  it("相对时间说人话（且不出现负值）", () => {
    const now = 1_000_000_000_000;
    expect(humanAgo(now - 5_000, now)).toBe("刚刚");
    expect(humanAgo(now - 120_000, now)).toBe("2 分钟前");
    expect(humanAgo(now - 7_200_000, now)).toBe("2 小时前");
    expect(humanAgo(now + 10_000, now)).toBe("刚刚"); // 未来时间不显示「-1 分钟前」
  });
});
