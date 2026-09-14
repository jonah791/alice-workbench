<!--
purpose: 爱丽丝工作台 —— 多智能体工作台的桌面控制台（看得到 · 点得进 · 起得来）
inject: 无（非 DSH 插件：不参与任何 profile 组合，不注入工具面）
tools: 无 DSH 工具；应用内 IPC 命令 = bus_snapshot / send_message / dsh_status / dsh_recover
runtime: Tauri 2 · Rust 1.77+ · WebView2 · React 18 · Vite 6
envDeps: WebView2 Runtime（Win10/11 自带）；DSH 运行时（可选，仅「一键恢复」需要）
boundary: 只读总线产物 + 只写 mailbox/<node>/*.json；不读 DSH 私有会话格式；零模型调用
compat: 对应 dsh-agent-cluster 总线协议 v1；总线根可用 DSH_CLUSTER_DIR 覆盖
-->

# alice-workbench · 爱丽丝工作台

![version](https://img.shields.io/badge/version-0.1.0-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![tests](https://img.shields.io/badge/tests-8%20passed-brightgreen)
![token](https://img.shields.io/badge/token%20cost-0-brightgreen)

**一句话**：常驻桌面的控制台，把「本机有几个智能体节点、它们此刻在做什么、DSH 还活着吗」变成**一眼可见**。

**为什么需要它**：多智能体工作台里，主脑每一轮对话都在烧 token——但「看看现在什么状态」这件事**不该烧**。本应用用文件读取 + 本地进程探测代替「问模型」，把监控与控制从对话里剥出来：**应用本身零模型调用**。

## 能力

| 区域 | 做什么 |
|---|---|
| **驾驶舱**（默认视图） | DSH 状态灯 · 节点名册（人话名 + 在线灯）· 一键恢复 |
| **节点详情**（点开节点） | 该节点的心跳信息 + 相关事件流 + **发消息入口**（写入总线信箱） |
| **实时行为流**（右栏常驻） | 总线事件 + 本机动作按时间倒序，新事件高亮一次 |

- 背靠文件总线：**harness 无关**——不只服务 DSH，任何会读写文件的 harness 节点都会被看见（见 [`dsh-agent-cluster`](../dsh-agent-cluster)）。
- 新节点上线 **< 1 秒**出现在面板（内容指纹轮询，见「设计要点」）。

## 快速开始

```bash
# 依赖（Node 20+ / pnpm 11 / Rust 1.77+ / WebView2）
pnpm install

# 开发模式（自动拉起 vite + Tauri 窗口）
pnpm dev:app

# 只跑前端（无 Tauri 环境时 IPC 不可用，仅用于样式开发）
pnpm dev

# 打安装包（NSIS）
pnpm build:app
```

**30 秒验证**：启动后应看到顶栏三盏灯（DSH / 节点 / 总线）与左栏节点名册。
若左栏为「总线暂无心跳」，说明本机还没有节点在跑——启动一个 DSH 实例即可看到它出现。

## 配置

| 项 | 默认 | 说明 |
|---|---|---|
| 总线根 | `%USERPROFILE%\.dsh-cluster` | 环境变量 `DSH_CLUSTER_DIR` 覆盖 |
| 轮询间隔 | `150 ms` | `src-tauri/src/bus.rs` 的 `POLL_MS`；直接影响 P1-4 的 1s 判据余量 |
| 离线判据 | `30 s` | `OFFLINE_AFTER_MS`，**与插件同源**，改一处必须改两处 |
| DSH 端口 | 心跳 `port` → 回退 `3080` | 心跳未上报端口时用回退值探测 `127.0.0.1` |

**没有硬编码路径**：workspace 从总线心跳读取，运行时管理器路径由它推导（`<workspace>/.dsh/init-dsh.ps1`）。

## 落盘与自证

**本应用不写任何自有落盘**（无 trace、无 state、无缓存）——这是刻意的：

- 它读的一切都在总线里，总线本身（`cluster-trace.jsonl`）就是证据层；
- 应用自身动作以 `LocalEvent` 形式**显示在实时行为流**，但只存在于内存（重启即清）。

**一条命令回答「应用看到了什么」**：

```powershell
# ① 总线根 ② 心跳文件数 ③ 行为事件尾部
$b = "$env:USERPROFILE\.dsh-cluster"; $b; (Get-ChildItem "$b\nodes").Count; Get-Content "$b\cluster-trace.jsonl" -Tail 3
```

## 生效判据与回退

| 问题 | 判据 |
|---|---|
| 窗口里跑的是不是最新前端？ | `pnpm build` 后 `dist/assets/index-*.js` 的 hash 变化 + 重新 `pnpm dev:app` |
| Rust 改动生效了吗？ | Tauri **dev 模式会重编译**；若改了 `tauri.conf.json` 需重启 `dev:app`（配置不热重载） |
| **重新构建 ≠ 生效** | `dist/` 更新不会自动进已运行的窗口——dev 模式靠 vite HMR（前端）与 cargo 重编译（后端），二者都要求进程还活着 |

**回退三档**：① 前端/后端源码 `git revert` ② 不想要窗口就直接关掉（无后台常驻、无系统改动）③ 一键恢复动过的 DSH 进程由 DSH 自己的守护链管理，与本应用无关。

## 测试

<!-- TESTS:BEGIN -->
（构建验证后填入实测数字与命令）
<!-- TESTS:END -->

端到端验收（P1 判据）见 `docs/semantic.md` §7。

## 设计要点（非显然的约束）

1. **轮询代替文件监听**：spec 原写 `notify`，实现改为 150ms 指纹轮询——零第三方依赖、Windows 行为可预测，对 1s 判据有 6x 余量；接口保持可替换（`start_watch`）。已回写 spec（§5.20 纪律：实施偏差必须回写）。
2. **只读总线标准产物，不读 DSH 会话格式**：读 `session.v3.jsonl.zstd` 会把这个应用锁死在 DSH 上（spec §4.5 修正 1）。
3. **后端不 panic**：坏 JSON、缺字段、超大文件一律跳过（`bus.rs` 有 8 条测试覆盖这些路径）。宿主内进程里逃逸的异常等于死因，这条纪律在桌面应用同样适用。
4. **`from = "owner"`**：应用代表主人发话，不冒充智能体节点——否则「谁说的」这条因果链会被污染。
5. **单一写面**：应用唯一会写的文件是 `mailbox/<node>/*.json`。想加写权限前先读 `docs/semantic.md` 的不变量 I1。

## 相关文档

- 语义文档（权威契约）：[`docs/semantic.md`](docs/semantic.md)
- UI 设计语言：[`docs/DESIGN.md`](docs/DESIGN.md)
- 实施依据（总线协议与分期验收）：[`dsh-agent-cluster/docs/spec.md`](../dsh-agent-cluster/docs/spec.md)
- 生态中心仓：[alice-digital-life](https://github.com/jonah791/alice-digital-life)

## License

MIT © jonah791

---

本应用属于**爱丽丝 DSH 自研生态**——与 50 个自研插件同源，见中心仓 [alice-digital-life](https://github.com/jonah791/alice-digital-life)。
