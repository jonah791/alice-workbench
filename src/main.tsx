import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

/** 启动期错误可见化：空白页面是最没有信息量的失败形态。
 *  把错误直接画在页面上——排查不靠猜，靠页面自己说出来。 */
function showBootError(label: string, detail: string) {
  const el = document.createElement("pre");
  el.setAttribute("data-boot-error", label);
  el.style.cssText =
    "position:fixed;inset:0;margin:0;padding:24px;background:#12161f;color:#ff2d95;" +
    "font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;z-index:9999;overflow:auto";
  el.textContent = `[${label}]\n${detail}`;
  document.body.appendChild(el);
}

window.addEventListener("error", (e) => {
  showBootError("boot error", `${e.message}\n${e.filename ?? ""}:${e.lineno ?? ""}`);
});
window.addEventListener("unhandledrejection", (e) => {
  showBootError("unhandled rejection", String((e as PromiseRejectionEvent).reason));
});

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err) {
  showBootError("render threw", String(err));
}
