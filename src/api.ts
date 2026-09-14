import { mockDshStatus, mockSnapshot } from "./mock";
import type { DshStatus, Snapshot } from "./types";

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

export const busSnapshot = async (): Promise<Snapshot> =>
  DEMO ? mockSnapshot() : (await core())<Snapshot>("bus_snapshot");

export const sendMessage = async (to: string, text: string, kind?: string): Promise<string> =>
  DEMO ? `m-demo-${Date.now().toString(16)}` : (await core())<string>("send_message", { to, text, kind });

export const dshStatus = async (): Promise<DshStatus> =>
  DEMO ? mockDshStatus() : (await core())<DshStatus>("dsh_status");

export const dshRecover = async (): Promise<string> =>
  DEMO ? "（演示模式）不会真的启动 DSH" : (await core())<string>("dsh_recover");

/** 演示模式下用定时器模拟"总线有变化"，让行为流与节点灯看起来是活的。 */
export const onBusChanged = async (fn: (s: Snapshot) => void): Promise<() => void> => {
  if (DEMO) {
    const id = window.setInterval(() => fn(mockSnapshot()), 2500);
    return () => window.clearInterval(id);
  }
  const listen = await events();
  return listen<Snapshot>("bus-changed", (e) => fn(e.payload));
};
