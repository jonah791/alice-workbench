/** 委托输入框 —— 主人的**唯一动作**（宪法 ②：「我负责的话，也只是最初的输入」）。
 *
 *  刻意极简：一个多行输入 + 一个按钮。没有格式工具条、没有附件选择器
 *  （`attachments` 契约在，但 v0.5 第一版不做选择器 —— 见 `docs/semantic.md` §10 V3），
 *  更不出现「选目标节点」这类内部概念。
 *
 *  Ctrl / Cmd + Enter 提交：跟旧版的 `TaskComposer` 同手感，且避免回车误发。 */

import { useState } from "react";

export function Composer({ onSubmit }: { onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSend = text.trim().length > 0 && !busy;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(text.trim());
      setText("");
    } catch (e) {
      // 失败必须响（§5.10）：静默吞掉会让主人以为委托已经发出去了
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="composer">
      <textarea
        className="composer-input"
        placeholder="要我做点什么？（一句话就够）"
        value={text}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <div className="composer-foot">
        <button className="composer-send" disabled={!canSend} onClick={() => void send()}>
          {busy ? "提交中…" : "交给我"}
        </button>
        <span className="composer-hint">Ctrl + Enter</span>
      </div>
      {err && <div className="composer-err">没发出去：{err}</div>}
    </div>
  );
}
