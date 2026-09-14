import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

/* 错误分级（改自 2026-09-14 实测教训）：
   最初的实现把**所有** unhandled rejection 都画成整屏覆盖层——结果一个非致命的
   `event.listen` 权限拒绝把整个驾驶舱遮死了。空白页是最没信息量的失败形态，
   但**盖住可用 UI** 又走到另一个极端。判据：
     - 启动期同步致命（渲染都没跑起来）→ 全屏覆盖，因为此时没有 UI 可看；
     - 运行时非致命（某个能力不可用、某次调用失败）→ 右下角提示条，**UI 该保持可用**。 */

function showFatal(label: string, detail: string) {
  const el = document.createElement("pre");
  el.setAttribute("data-boot-error", label);
  el.style.cssText =
    "position:fixed;inset:0;margin:0;padding:24px;background:#12161f;color:#ff2d95;" +
    "font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;z-index:9999;overflow:auto";
  el.textContent = `[${label}]\n${detail}`;
  document.body.appendChild(el);
}

function showToast(label: string, detail: string) {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = `[${label}] ${detail}`.slice(0, 400);
  el.title = detail;
  el.onclick = () => el.remove();
  host.appendChild(el);
  window.setTimeout(() => el.remove(), 15_000);
}

window.addEventListener("error", (e) => {
  showToast("error", `${e.message} @ ${e.filename ?? "?"}:${e.lineno ?? "?"}`);
});
window.addEventListener("unhandledrejection", (e) => {
  showToast("rejection", String((e as PromiseRejectionEvent).reason));
});

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err) {
  showFatal("render threw", String(err));
}
