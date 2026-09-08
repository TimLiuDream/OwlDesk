# OwlDesk 开发任务清单（TODO）

> 依据：[ARCHITECTURE.md](./ARCHITECTURE.md) · 需求见 [PRD.md](./PRD.md)
> 编制日期：2026-09-09 · **提交截止 2026-09-21（剩 12 天）**
> 用法：完成一项勾一项；每个任务都有"验收"标准，勾掉前先对照。

## 里程碑总览

| 阶段 | 日期 | 交付物 | 状态 |
|---|---|---|---|
| P0 风险验证 | 9/9 | rToken 标的清单、signal 质量结论、Demo Key、Qwen 额度 | ⬜ |
| P1 脚手架 + Agent Hub 层 | 9/9–9/10 | 可运行骨架，SDK 双实例 + 工具注册表跑通 | ⬜ |
| P2 模块 A 夜间晨报 | 9/11–9/13 | 巡检 + 晨报流水线 + Dashboard 页面 | ⬜ |
| P3 模块 C 拟单台 | 9/14–9/16 | 计划卡 + 风险标注 + 签字流 + paper 下单 | ⬜ |
| P4 Chat 整合 | 9/17–9/18 | SSE 对话编排 + 跨模块入口 + 整夜真实试跑 | ⬜ |
| P5 部署 | 9/19 | Vercel 上线 + 录屏 + 使用证明三件套 | ⬜ |
| P6 提交 | 9/20（9/21 缓冲） | X 帖子 + 表单提交 | ⬜ |

> ⏰ **硬截止提醒：Qwen 30U 额度申请 9/15 截止**（https://forms.gle/2QeJpvGB5VpipqQ68 ），见 T0.5。

---

## P0 · 风险验证（9/9，一天内必须清完）

> 这是排期里最优先的事：PRD §9 的风险项在这里集中关闭，避免 P2/P3 写到一半被数据问题打回。

- [ ] **T0.1 开发环境确认**
  Node ≥20、pnpm/npm 可用、Git 推送权限。验收：`node -v` ≥ 20。
- [ ] **T0.2 Bitget 账户 + Demo API Key 申请**
  bitget.com/api-management 创建 Demo Key，`.env` 本地落好（不提交）。
  验收：Key 能通过 SDK 签名鉴权（`account_overview` 返回 200）。
- [ ] **T0.3 rToken 美股覆盖实测**（PRD 风险①，**P0 的核心**）
  用 SDK 只读实例调 `market` 模块，枚举可查的代币化美股代码；确认行情字段（价格/成交量/涨跌幅）完整度。
  验收：产出一张「可用标的表」（≥10 只热门股），写进 `docs/notes/rtoken-coverage.md`，并据此定默认 watchlist。若覆盖不足 → 启用 fallback 方案（公开美股行情展示 + rToken 做执行演示），当天拍板。
- [ ] **T0.4 bitget-signal 五技能实测**（PRD 风险②）
  `npx @bitget-ai/bitget-signal --target all` 安装后，逐个跑 macro / market-intel / sentiment / technical / news-briefing，记录输出深度、延迟、稳定性。
  验收：每个技能留 1 份样例输出到 `docs/notes/signal-samples.md`；给出晨报权重分配结论（哪些做主料、哪些做辅料或砍掉）。
- [ ] **T0.5 LLM 额度落实** ⏰ 9/15 前完成
  提交 Qwen 30U 申请表；同时本地直连一次 Qwen API（OpenAI 兼容协议）验证 function calling 可用。
  验收：一段 function-calling 调用样例跑通；获批邮件截图存档。
- [ ] **T0.6 使用证明截图 #1**
  `bgc discover`（操作目录）+ 一次行情快照调用成功画面。
  验收：2 张截图入 `docs/proof/`（提交表单 Q8 素材）。

## P1 · 脚手架 + Agent Hub 接入层（9/9–9/10）

> 对应架构文档 §2/§3/§5。

- [ ] **T1.1 Next.js 脚手架**
  `create-next-app`（App Router + TS + Tailwind）+ shadcn/ui 初始化；按架构 §3 建目录（`lib/agenthub` `lib/llm` `lib/jobs` `lib/db` `components`）。
  验收：`pnpm dev` 起得来，空首页渲染。
- [ ] **T1.2 `lib/agenthub/client.ts` — SDK 双实例**
  只读实例（market + account）/ paper 实例（trade），Demo Key 走环境变量；统一错误包装与限流处理。
  验收：单测或脚本各调 1 次成功；错误路径返回结构化错误。
- [ ] **T1.3 `lib/agenthub/tools.ts` — 工具注册表**
  按 §5.2 实现 7 个工具的 schema 与实现映射；`submit_signed_order` 不注册进 chat 编排器（只留 sign 端点调用）。
  验收：每个工具可用一段脚本独立调用并返回 JSON。
- [ ] **T1.4 `lib/agenthub/signal.ts` — signal 封装**
  五技能统一返回 `{ headline, keyPoints[], sources[], asOf }`（按 T0.4 实测结论取舍）。
  验收：返回体带 sources 字段，可供引用标注。
- [ ] **T1.5 `lib/db` — schema + 初始化**
  建架构 §6 的 6 张表；seed 默认 watchlist（用 T0.3 的标的表）。
  验收：`sqlite3 .schema` 与文档一致；watchlist 有种子数据。
- [ ] **T1.6 `.env.example` + README 补充运行说明**
  验收：新人按 README 三条命令能跑起来。

## P2 · 模块 A：夜间晨报（9/11–9/13）

> 对应 PRD §4 模块 A（A1–A3、A5）与架构 §4.3/§7。

- [ ] **T2.1 `lib/jobs/patrol.ts` — 巡检任务**
  拉 watchlist 行情 → 异动阈值（|Δ|>1.5%）→ `news-briefing` 增量 → 落 `overnight_events`；美东 9:30–16:00 窗口判断。
  验收：手动触发一轮，events 表有新增且带 ts_et / type / source_url。
- [ ] **T2.2 `/api/cron/patrol` + `vercel.json`**
  cron 每 15 分钟；窗口外空转直接返回。
  验收：本地用 `vercel dev` 或 curl 模拟触发成功；cron 配置入库。
- [ ] **T2.3 `lib/jobs/brief.ts` — 晨报生成**
  events 按标的聚合 → `prompts.ts` 简报体例（发生了什么/为什么/怎么看 + 今日关注）→ 落 `briefs`；强制 citations（行情带时间戳、新闻带 URL）。
  验收：对一夜 events 生成出的晨报无"无来源断言"（抽查 5 条）。
- [ ] **T2.4 API 三件套：`/api/brief` `/api/events` `/api/watchlist`**
  含 `POST /api/brief` 手动触发生成（演示不等收盘）。
  验收：curl 全部通过；brief 返回 summary_json 结构完整。
- [ ] **T2.5 前端：晨报 Dashboard（首页）**
  对照原型 `prototype/index.html` 晨报视图：行情条 + BriefCard 三段式 + Timeline 展开 + 今日关注；TanStack Query 拉数。
  验收：像素级功能对齐原型（允许简化视觉）；空数据时显示示例晨报并标注"演示数据"。
- [ ] **T2.6 前端：Watchlist 管理**
  增删标的（对标 PRD A1）。
  验收：改动即时反映到巡检与晨报。
- [ ] **T2.7 整夜真实试跑（第一次）**
  预置 5 标的挂一整夜。
  验收：次日晨报页完整可读——这是 P2 的 DoD。

## P3 · 模块 C：拟单台（9/14–9/16）

> 对应 PRD §4 模块 C（C1–C5）与架构 §4.2/§8。**本阶段的安全路径是全项目评审重点。**

- [ ] **T3.1 `lib/llm/draft-order.ts` — NL → 结构化计划**
  按架构 §4.2 schema 结构化输出（symbol/side/type/qty/limit/trigger/tif/rationale）；解析失败回退追问用户。
  验收：三类指令各 1 句（市价/限价/条件单）生成字段正确的计划。
- [ ] **T3.2 `riskCheck()` — 风险标注**
  仓位占比（读只读持仓）、偏离现价、与持仓方向冲突、异常数量；产出 warnings 数组，超阈值标 bad。
  验收：构造 3 个风险案例（超仓/冲突/偏离过大）全部正确标注。
- [ ] **T3.3 `/api/orders` 三端点 + 状态机**
  `POST`（draft）→ `POST /:id/sign` → `POST /:id/cancel`；状态机 draft/signed/submitted/filled/canceled/rejected；sign 前置校验 status 与风险阻断项；写 `audit_log`。
  验收：未签底的 draft 无法提交（直接 curl 验证拒绝）；sign 全链路留痕。
- [ ] **T3.4 paper 下单对接**
  `strategy_order` 调用 + `agenthub_ref` 回写 + 状态同步。
  验收：Bitget 模拟盘查到订单，方向/数量/触发价与计划卡一致。
- [ ] **T3.5 前端：计划卡 + 签字流 + 挂单列表**
  对照原型拟单视图：OrderPlanCard（参数表 + 风险区）、SignDialog 二次确认、挂单表（状态 pill、撤单）、30s 状态轮询。
  验收：完整走通"拟单 → 拒签（无订单产生）→ 重拟 → 签字 → 提交 → 撤单"。
- [ ] **T3.6 使用证明截图 #2**
  paper 下单成功页 + Bitget 模拟盘订单截图。
  验收：2 张截图入 `docs/proof/`。

## P4 · Chat 编排与整合（9/17–9/18）

> 对应架构 §4.1，PRD H1/H2、A4（追问）、C6（情景拟单）。

- [ ] **T4.1 `lib/llm/provider.ts`**
  Qwen（OpenAI 兼容）为主，Claude 备选，一个接口切换。
  验收：同一 prompt 两个 provider 都能跑。
- [ ] **T4.2 `lib/llm/orchestrator.ts` — 工具调用循环**
  组装上下文（watchlist + 当日 brief 摘要 + 只读持仓）→ function calling → 最多 6 轮 → 流式输出；引用标注透传。
  验收：三个代表性问题（行情/解读/拟单）路由正确，`tool` 事件可见。
- [ ] **T4.3 `/api/chat`（SSE）+ 前端 ChatMessage**
  delta / citations / tool / action 四类事件；对话内"拟单"只产出 draft 卡片并跳转拟单台。
  验收：流式无卡顿；引用在消息底部渲染。
- [ ] **T4.4 跨模块入口串联**
  晨报卡"追问解读" → 预填 chat；"就此拟单" → 预填拟单台（PRD A4/C6）。
  验收：两条路径从晨报页一键可达。
- [ ] **T4.5 全链路整夜试跑（第二次，带 Chat）**
  验收：睡醒后用 Chat 完成"读简报 → 追问 → 拟单 → 签字"全流程零人工干预报错。

## P5 · 部署与演示材料（9/19）

- [ ] **T5.1 Vercel 部署**
  env：`LLM_API_KEY` `LLM_BASE_URL` `BITGET_DEMO_API_KEY/SECRET/PASSPHRASE` `DEMO_MODE=1`；cron 生效。
  验收：生产链接晨报/拟单/对话三视图可用；cron 触发日志存在。
- [ ] **T5.2 演示兜底**
  无数据时回退示例晨报（标注演示数据）；Demo 模式只读可见、写接口不被滥用。
  验收：无痕浏览器 + 手机各开一遍部署链接，评审随时打开都有内容。
- [ ] **T5.3 录屏 + 使用证明截图 #3**
  60–90 秒演示录屏（睡 → 醒 → 晨报 → 追问 → 拟单 → 签字）；部署页 Agent Hub 调用可见截图。
  验收：素材入 `docs/proof/`，录屏 ≤ 90s。
- [ ] **T5.4 README 更新**
  部署链接、演示录屏链接、路线图勾选更新。

## P6 · 提交（9/20，9/21 缓冲）

- [ ] **T6.1 发 X 帖子**（**先发帖后填表**）
  项目名 OwlDesk + 一句话介绍 + 截图（原型/部署页）+ `#AgenticTrading` `#BuilderOS`。
  验收：帖子公开可见，链接留存。
- [ ] **T6.2 填提交表单 Q1–Q11**
  Q7 项目描述六部分直接取材：Problem/Solution = PRD §1–3；Agent 能力 = 感知/解读/拟单；架构 = ARCHITECTURE §1；使用流程 = 原型闭环；Agent Hub 赋能 = README 赋能表；Q8 用 `docs/proof/` 三件套。
  验收：提交回执截图；**子主题二选一**（信息提炼 vs 执行辅助，按 T4.5 后哪边演示更顺拍板）。
- [ ] **T6.3 缓冲日（9/21）**
  处理表单被驳回/链接故障等意外；此后不再改代码。

---

## 持续跟踪（每周检查）

- [ ] rToken 标的覆盖是否有变化（T0.3 结论可能过期）
- [ ] signal 技能稳定性（连续失败 ≥2 次即降权/降级）
- [ ] Qwen 额度消耗（30U 大约够多少 token，超支则切便宜模型做巡检类调用）
- [ ] `docs/proof/` 截图是否随版本更新（提交前最后一遍刷新）

## 依赖关系速查

```
T0.3 ──→ T1.5(seed) ──→ T2.1
T0.4 ──→ T1.4 ──→ T2.3
T0.2 ──→ T1.2 ──→ (T2.1 / T3.4)
T1.2/T1.3/T1.4 ──→ T4.2
T2.7 ──→ T4.5 ──→ T5.3
T5.1 ──→ T6.1 ──→ T6.2
```

> 原则：**P0 没清完不开 P2/P3 的代码**；每天收工前更新本文件勾选状态。
