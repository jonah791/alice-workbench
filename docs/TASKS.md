# 任务视图（工作台侧契约草稿）

> 本文件由**参考适配器**（ref-node）执行创建——它是 P2 任务协议在**真实总线**上的首个任务。
> 协议主副本：`dsh-agent-cluster/docs/semantic.md` §5.5（台账）/ §5.6（消息）/ §5.7（行为事件）。

数据源：`<busDir>/tasks/<taskId>.json`。

## 一句话列表显示什么

- `<taskId 短号>` · `状态色点` · `<assignee>` · `<intentRef 截断 40 字>`
- 状态色：`drafted` 灰 · `dispatched` 青 · `running` 琥珀（闪） · `returned` 蓝 · `verifying` 紫 · `done` 绿 · `failed` 品红

## 点开详情显示什么

1. **意图原文**（`intentRef`，不转述）+ **判据**（`acceptance`）+ 等级（`grade`）
2. **证据列表**（`evidence[]`：kind / path / sha256）——可复制，便于主脑独立复现
3. **未验证项**（`unverified[]`）——**必须显眼，不许折叠**（诚实优先于好看）
4. **裁决**（`verdict`：by / at / pass / method / note）

## 诚实边界

- 台账**只有主脑写**（不变量 I8）⇒ 状态滞后 ≤ 一个主脑处理周期；**不假装实时进度**
- 实时进度看 `logs/actions/<actionId>.jsonl`（实时行为流已承担）
- 判据不合格的任务**不该存在**（I9：无判据不派发）——若列表里出现空判据，那是主脑侧工具的 bug，不是节点的
