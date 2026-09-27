import { mockCommissionSnapshot } from "./mock";
import type { CommissionSnapshot } from "./types";

/** 是否运行在 Tauri 窗口里。浏览器里 `invoke` 必然失败，因此显式分流。 */
export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>);

/** 演示模式：开发 + 非 Tauri。**生产构建永不启用**（否则真实窗口会显示假数据）。 */
export const DEMO = !IS_TAURI && import.meta.env.DEV;

/* Tauri API 用**动态 import** 加载，而不是顶层 import：
   - 浏览器预览里完全不会加载 Tauri 代码（顶层 import 会让整个模块图在非 Tauri 环境里求值）；
   - 真实窗口里首次调用时加载一次，之后走缓存。
   这是「同一份前端既能进窗口、也能进浏览器预览」的关键。 */
type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type ListenFn = <T>(event: string, cb: (e: { payload: T }) => void) => Promise<() => void>;

let _invoke: InvokeFn | null = null;
let _listen: ListenFn | null = null;

async function core(): Promise<InvokeFn> {
  if (!_invoke) {
    const mod = await import("@tauri-apps/api/core");
    _invoke = mod.invoke as InvokeFn;
  }
  return _invoke;
}

async function events(): Promise<ListenFn> {
  if (!_listen) {
    const mod = await import("@tauri-apps/api/event");
    _listen = mod.listen as unknown as ListenFn;
  }
  return _listen;
}

/* ── 委托台：两个命令，一条事件 ────────────────────────────────────────
   **内部一律不可见**（宪法 ①）—— 这一节里没有节点、没有总线、没有日志，
   那是刻意的，不是还没写。 */

export const listCommissions = async (): Promise<CommissionSnapshot> =>
  DEMO ? mockCommissionSnapshot() : (await core())<CommissionSnapshot>("list_commissions");

export const submitCommission = async (text: string, attachments?: string[]): Promise<string> =>
  DEMO
    ? `c-demo-${Date.now().toString(16)}`
    : (await core())<string>("submit_commission", { text, attachments });

/** 委托 / 产物变化。窗口隐藏时后端**不**推送，前端回前台自己补一次快照（§5.2）。 */
export const onCommissionsChanged = async (
  fn: (s: CommissionSnapshot) => void,
): Promise<() => void> => {
  if (DEMO) {
    const id = window.setInterval(() => fn(mockCommissionSnapshot()), 2500);
    return () => window.clearInterval(id);
  }
  const listen = await events();
  return listen<CommissionSnapshot>("commissions-changed", (e) => fn(e.payload));
};
