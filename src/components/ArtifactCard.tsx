/** 产物卡 —— I4（不预设产物类型）落地的唯一位置。
 *
 *  任何我能做到的事都是合法产物，所以这里**没有「支持的格式」这个概念**：
 *  认识的给一点额外信息（图 / 视频 / 代码 / 网页），不认识的一律当文件。
 *  降级不是兜底，是设计（`kind` 由后端按扩展名判定，未知一律 `file`）。
 *
 *  v0.5 第一版只说清「它是什么、多大、在哪」并给一键复制路径。
 *  内联预览（图 / 视频）与「用系统打开」需要 Tauri asset 协议或 opener 插件，
 *  留待 V1（见 `docs/semantic.md` §10）——**不假装已经有了**。 */

import type { Artifact } from "../types";

const KIND_LABEL: Record<string, string> = {
  image: "图片",
  video: "视频",
  code: "代码",
  page: "网页",
  file: "文件",
};

/** 人话体积。未知字段（0）也说人话，不显示「NaN」。 */
export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ArtifactCard({ a }: { a: Artifact }) {
  const label = KIND_LABEL[a.kind] ?? "文件";
  return (
    <div className={`artifact kind-${a.kind}`}>
      <div className="artifact-head">
        <span className="artifact-name" title={a.name}>
          {a.name}
        </span>
        <span className="artifact-meta">
          {label} · {humanSize(a.bytes)}
        </span>
      </div>
      <div className="artifact-path" title={a.path}>
        {a.path}
      </div>
      <button
        className="artifact-copy"
        title="复制完整路径"
        onClick={() => {
          void navigator.clipboard?.writeText(a.path);
        }}
      >
        复制路径
      </button>
    </div>
  );
}
