# alice-workbench · 语义文档（现在是什么）

> 语义文档纪律（AGENTS.md §5.20）：先写清「是什么」，实现逼近它，实践回修它。
> 本文描述**已实现**的契约；未实现项一律标 `未实现`，未验证项标 `待线上验收`。

## 1 · 元信息

| 项 | 值 |
|---|---|
| id | `alice-workbench` |
| 版本 | v0.1.0（MVP / P1） |
| 主副本 | 本文件（`projects/self/alice-workbench/docs/semantic.md`） |
| 关联 | 实施依据 `self-plugins/dsh-agent-cluster/docs/spec.md` §4.3 §4.5 §7-P1；表现层 `docs/DESIGN.md` |
| 最近复核 | 2026-09-14 |

## 2 · 定位与反定位

**定位**：常驻桌面的**观察与控制台**。把「本机有哪些智能体节点、它们此刻在做什么、DSH 运行时是否活着」变成一眼可见，且**零模型调用**（不烧 token）。

**反定位**（明确不做）：
- 不是 DSH 插件（不参与 profile 组合、不注入工具面）
- 不是消息路由器（不替主人转发、不做批处理判断——那是主脑的活）
- 不读 DSH 私有会话格式（`session.v3.jsonl.zstd`）——那会锁死未来（spec §4.5 修正 1）
- 不做智能决策（只看与只转发，判断永远归主脑/主人）

## 3 · 术语

| 词 | 含义 |
|---|---|
| 总线（bus） | 文件系统契约，默认 `%USERPROFILE%\.dsh-cluster`，可用 `DSH_CLUSTER_DIR` 覆盖 |
| 节点（node） | 可被寻址的智能体运行时：身份 + 能力 + 信箱 + 行为落盘 + 结果回传。**harness 无关** |
| 心跳 | `nodes/<nodeId>.json`，节点每 ~10s 覆写；`atMs` 是判活时间戳 |
| 行为事件 | `cluster-trace.jsonl` 一行一阶段（`phase`），是 R6「行为必须落盘」的现成载体 |
| 快照（snapshot） | 应用一次性读取的总线视图；`fingerprint` 是内容摘要，用于判断"变了没" |

## 4 · 概念模型与不变量

```
Rust 后端（唯一写者=mailbox）
  bus::snapshot(dir)  ──读──▶  nodes/ · mailbox/ · state/ · cluster-trace.jsonl
        │
        └─ 指纹变化 ──▶ emit("bus-changed", Snapshot) ──▶ React 前端渲染
```

**不变量**：
- **I1 单一写面**：应用只写 `mailbox/<to>/<id>.json`，不改总线其它任何文件。
- **I2 只读判活**：节点在线判据 = `now - atMs < 30_000`，与插件 `DEFAULT_OFFLINE_AFTER_MS` 同源；应用**不猜测**节点状态。
- **I3 零模型调用**：应用不发起任何 LLM 请求（无 key、无 endpoint、无 SDK）。
- **I4 坏数据不致命**：任何单文件损坏（坏 JSON / 缺字段 / 超大）只跳过该文件，不影响其余视图（§5.24：逃逸异常 = 宿主死因）。
- **I5 harness 无关**：只依赖总线标准产物；`displayName`/`harness`/`capabilities` 等为**可选字段**，缺失时回退显示，不报错。

## 5 · 契约（含调用点清单）

### 5.1 Tauri IPC 命令（前端 → Rust）

| 命令 | 入参 | 出参 | 调用点（前端） |
|---|---|---|---|
| `bus_snapshot` | — | `Snapshot` | `src/App.tsx` 首帧 |
| `send_message` | `to`, `text`, `kind?` | 消息 id | `src/views/NodePanel.tsx` 提交 |
| `dsh_status` | — | `DshStatus` | `src/App.tsx`（10s 轮询） |
| `dsh_recover` | — | 启动说明 | `src/App.tsx` 顶栏按钮 |

### 5.2 后端事件（Rust → 前端）

| 事件 | 载荷 | 触发 |
|---|---|---|
| `bus-changed` | `Snapshot` | 内容指纹变化（150ms 轮询检测） |

### 5.3 总线读写契约

| 路径 | 权限 | 说明 |
|---|---|---|
| `nodes/*.json` | 只读 | 心跳；字段 `nodeId/atMs/pid/role/profile/workspace/port/...` |
| `mailbox/<node>/*.json` | 读 + **写** | 收件箱；写时 `v=1`、`from="owner"`、`ttlMs=86400000` |
| `mailbox/<node>/done/*.json` | 只读 | 已投递归档 |
| `state/*.json` | 只读 | 幂等集合 / 重试账（当前仅计入指纹） |
| `cluster-trace.jsonl` | 只读 | 行为事件流；取尾部 300 条 |

### 5.4 `from` 字段语义

工作台**代表主人**发话 ⇒ `from = "owner"`。它不冒充任何智能体节点（冒充会污染"谁说的"因果链）。

## 6 · 边界与信任

- **信任模型**：总线是**同机**协作面，非安全边界（对照 spec R1/R2）。应用不加认证，因为同一用户账号下任何进程本来就能读写这些文件。
- **越权防范**：`send_message` 校验目标名不含路径分隔符与通配符，防止写出 `mailbox/` 之外的路径。
- **隐私**：不落盘任何凭据；workspace 路径从心跳读取，**不硬编码**（也避免公开仓库泄露本机路径）。
- **副作用**：唯一外部可见副作用 = 写一条消息文件；`dsh_recover` 会**启动进程**（危险动作，UI 需二次确认——`未实现`，见 §10）。

## 7 · 可证伪验收

| # | 判据 | 状态 |
|---|---|---|
| A1 | 打开应用即见 DSH 状态灯 + 节点名册 + 事件流（对应 spec P1-1） | `待线上验收` |
| A2 | 点击节点展开其事件流并出现发消息入口（spec P1-2） | `待线上验收` |
| A3 | DSH 未响应时一键恢复可调起运行时管理器，恢复过程在行为流可见（spec P1-3） | `待线上验收` |
| A4 | 新增一个心跳文件后 **1s 内**节点出现在面板（spec P1-4） | `待线上验收` |
| A5 | 应用自身零模型调用（无网络请求到 LLM；无 token 消耗）（spec P1-5） | `待线上验收` |
| A6 | 总线缺失/心跳损坏时应用仍可用（不崩、显示空态） | `待线上验收` |
| A7 | Rust 单元测试全绿 | `待线上验收` |

## 8 · 与实现关系

| 实现 | 位置 |
|---|---|
| 总线读取 / 指纹 / 轮询 / 事件 | `src-tauri/src/bus.rs` |
| DSH 探测与一键恢复 | `src-tauri/src/dsh.rs` |
| 命令注册与启动 | `src-tauri/src/lib.rs` · `main.rs` |
| 前端类型契约 | `src/types.ts`（与 Rust 结构体一一对应） |
| IPC 封装 | `src/api.ts` |
| 三视图 | `src/views/Cockpit.tsx` · `NodePanel.tsx` · `ActionStream.tsx` |
| 验收探针（造非 DSH 心跳） | `scripts/mock-node.ps1`（`-Cleanup` 清理；**不是适配器**，只写心跳） |

## 9 · 实践修订记录

| 日期 | 修订 | 原因 |
|---|---|---|
| 2026-09-14 | **轮询替代 notify**（spec §4.3 原写「watch 总线目录（notify）」） | notify 在 Windows 上需第三方 crate + 已知怪异行为；150ms 轮询零依赖、可预测，对 1s 判据有 6x 余量。接口 `start_watch` 保持可替换 → 已回写 spec |
| 2026-09-14 | **详情层读「总线标准事件」而非 DSH 会话文件** | 执行 spec §4.5 修正 1：读 DSH 私有格式会锁死未来 harness 迁移 |
| 2026-09-14 | `from` 定为 `owner` | 工作台代表主人，不冒充节点（§5.4） |

## 10 · 未决问题

| # | 问题 | 备注 |
|---|---|---|
| U1 | `dsh_recover` 的二次确认 | 危险动作（启动进程）；MVP 未做 UI 确认，P2 补 |
| U2 | 托盘常驻与通知 | spec §4.3 要求；MVP 未做 |
| U3 | `displayName` 人话名规则 | 插件尚未上报（spec §3.4 扩展字段）；当前回退为 `web-0` 式短名 |
| U4 | 节点分组/关系图 | spec 提到星图式呈现；P2 再做 |
| U5 | `cluster-trace.jsonl` 轮转 | 应用只读尾部 300 条；文件长期增长需要轮转策略（属插件侧） |
| U6 | 任务一句话列表的数据源 | spec §3.2 `tasks/` 台账尚未实现；MVP 显示事件流，无任务时为空态 |
