# OwlDesk 开发任务清单（TODO）

> 依据：[ARCHITECTURE.md](./ARCHITECTURE.md) · 需求见 [PRD.md](./PRD.md)
> 编制日期：2026-09-09 · **提交截止 2026-09-21（剩 12 天）**
> 用法：完成一项勾一项；每个任务都有"验收"标准，勾掉前先对照。
>
> **2026-09-09 进展**：P0 全部完成 + P1/P2/P3 代码一次性落地并构建通过，端到端冒烟通过（巡检→晨报→拟单→签字→状态查询）。详见各任务内 ✓ 标记。
>
> **2026-09-09 代码 Review**（第一性原理 + PRD 逐条）：发现 4 个正确性 bug、4 个 PRD 缺口、5 项安全/健壮性问题，**当日全部修复并回归验证**：
> - A1 数据诚实性：巡检/模拟成交一律拒绝演示价格源（`source!=="agenthub"` 门禁）
> - A2 "丢弃草稿"从假删除改为真实状态迁移（新增 discard 路由 + 审计）
> - A3 heuristic 解析器 symbol 拼接 bug（RBTCUSDTUSDT）+ 小数数量 + 突破方向
> - A4 qty 缺失/非法从 warn 升级为**硬阻断**（签字前拦截，回归验证 RISK_BLOCKED ✓）
> - A5 equity 从硬编码 25k 改为活账户读取（lib/account.ts 单一来源，共享给订单/风控/chat 工具）
> - A6 ET 偏移动态计算（跨冬令时正确）
> - A7 巡检异动限定同一 ET 交易日
> - A8 晨报默认回退"最近一份"（ET 跨日后不再空白，stale 标注）
> - B1 Watchlist 管理 UI（PRD A1 P0 补齐：晨报页增删标的）
> - B2 Chat 拟单/查挂单：`draft_order_plan`（只产草稿无执行权）+ `list_orders` 工具 + action 事件 + 聊天内草稿卡片（回归验证 action 事件 ✓）
> - B3 晨报"就此拟单"直达计划卡（自动起草）
> - B4 风险标注补同向叠加/减仓方向提示
> - C1 LLM 代理重试（5xx/429/网络错各一次退避）
> - C3 safe-fetch 补封 169.254/16（云元数据）与 100.64/10（CGNAT）
> - C4 签字时演示价拒用于市价换算；条件单跨价判定仅在活行情下执行
> - C5 audit actor 说明：单用户演示口径，提交材料勿宣称多用户审计

## 里程碑总览

| 阶段 | 日期 | 交付物 | 状态 |
|---|---|---|---|
| P0 风险验证 | 9/9 | rToken 标的清单✓、signal 质量结论✓、Demo Key（待用户申请）、Qwen 额度（待用户申请 9/15 截止） | ✅ 主体完成 |
| P1 脚手架 + Agent Hub 层 | 9/9 | 可运行骨架，SDK 实例 + 工具注册表跑通 | ✅ 提前完成 |
| P2 模块 A 夜间晨报 | 9/9 | 巡检 + 晨报流水线 + Dashboard 页面 | ✅ 提前完成（LLM 归因待配 Key） |
| P3 模块 C 拟单台 | 9/9 | 计划卡 + 风险标注 + 签字流 + paper 下单（模拟路径）| ✅ 提前完成（真实 Demo Key 待申请） |
| P4 Chat 整合 | 9/17–9/18 | SSE 对话编排 + 跨模块入口 + 整夜真实试跑 | 🔶 代码就绪，待 LLM Key 实测 |
| P5 部署 | 9/19 | Vercel 上线 + 录屏 + 使用证明三件套 | ⬜ |
| P6 提交 | 9/20（9/21 缓冲） | X 帖子 + 表单提交 | ⬜ |

> ⏰ **硬截止提醒：Qwen 30U 额度申请 9/15 截止**（https://forms.gle/2QeJpvGB5VpipqQ68 ），见 T0.5。

---

## P0 · 风险验证（9/9，一天内必须清完）

> 这是排期里最优先的事：PRD §9 的风险项在这里集中关闭，避免 P2/P3 写到一半被数据问题打回。

- [x] **T0.1 开发环境确认**（Node 24 / npm 11 / git 2.52 ✓）
- [x] **T0.2 Bitget 账户 + Demo API Key 申请** ✅ 2026-09-09（含资金到账与真实成交验证）
  Key 已验证；模拟盘资金已领取（50,000 USDT）。**真实 paper 成交闭环已跑通**：应用内 LLM 拟单 → 签字 → `order` 动词真实提交（orderId 1481408774009147392，BTCUSDT 市价买 0.0002）→ 交易所订单历史确认 → USDT 49,984.24 / BTC 5.0001998 余额变动实证。⚠️ 模拟盘未上线 rToken 交易对（已实现桌台模拟执行兜底，见 T3.4）。
- [x] **T0.3 rToken 美股覆盖实测** ✅ 2026-09-09
  结论：**726 个 rToken 标的**，格式 `R+TICKER+USDT`（RTSLAUSDT/RNVDAUSDT/RSPYUSDT…），单标的行情验证通过；v3 ticker 字段为 lastPrice/openPrice24h（无 change24h，涨跌幅自算）。**无需 fallback**。清单见 [notes/rtoken-coverage.md](./notes/rtoken-coverage.md)。
- [x] **T0.4 bitget-signal 五技能实测** ✅ 2026-09-09
  MCP 端点 `https://datahub.noxiaohao.com/mcp`（market-data-mcp v1.26.0，19 个工具，全部要 `action` 参数）。映射已落进 `lib/agenthub/signal.ts`：sentiment_index/news_feed/technical_analysis/macro_indicators/derivatives_sentiment。⚠️ 当前网络下 RSS 新闻源与 alternate.me 情绪源返回空（上游问题），已做内容校验 + demo 回落；部署到 Vercel 后需复测。
- [x] **T0.5 LLM 额度落实** ✅ 2026-09-09
  已接入 OpenAI 兼容代理（cavoti.com，模型 gpt-5.6-terra），三项能力实测通过：基础 chat ✓ / function calling ✓ / JSON mode ✓。`.env` 已配好（不入库）。Qwen 30U（申请已交，等 Key）到位后改 `LLM_BASE_URL/LLM_MODEL` 两行即可切换。注意：代理偶发 `provider_temporarily_unhealthy` 熔断，重试即恢复；正式提交素材生成前留重试余量。
- [x] **T0.6 使用证明截图 #1**（可用素材已具备：巡检日志 + events JSON；正式截图待 UI 跑起来后补 `docs/proof/`）

## P1 · 脚手架 + Agent Hub 接入层（✅ 9/9 提前完成）

> 对应架构文档 §2/§3/§5。**实现说明**：存储按架构文档预留的降级路径改为 JSON 文件存储（`lib/db`，Vercel FS 不持久化 + Windows 免原生编译），接口按表抽象可换回 SQLite。

- [x] T1.1 Next.js 脚手架（手动初始化兼容已有 docs/，Tailwind + 深色主题）
- [x] T1.2 SDK 双实例 client.ts（readonly: market+account / paper: trade，动态 import 容错降级）
- [x] T1.3 工具注册表 tools.ts（7 工具；submit_signed_order 不入 chat 编排器 ✓）
- [x] T1.4 signal.ts 五技能封装（MCP Streamable HTTP 直连，session 管理 + 内容校验 + demo 回落）
- [x] T1.5 JSON 存储层（6 表结构 + 种子 watchlist + 原子写锁）
- [x] T1.6 `.env.example` + README 运行说明（README 待补 Quick Start 命令）

## P2 · 模块 A：夜间晨报（✅ 9/9 提前完成，LLM 归因待 Key）

- [x] T2.1 patrol.ts 巡检（行情阈值 1.5% + news/sentiment 事件 + ET 时区窗口判断）
- [x] T2.2 /api/cron/patrol + vercel.json（CRON_SECRET 鉴权）
- [x] T2.3 brief.ts 晨报生成（三段式 prompt；LLM 缺失时模板降级并标注）
- [x] T2.4 API：brief/events/watchlist（含手动触发）
- [x] T2.5 晨报 Dashboard（三段式卡片 + 时间线 + 追问/拟单跳转）
- [x] T2.6 Watchlist 管理（API 层 ✓，UI 快捷入口待打磨）
- [ ] T2.7 整夜真实试跑（需挂一夜；建议 9/12 或 9/13 晚执行）

## P3 · 模块 C：拟单台（✅ 9/9 提前完成，真实 Demo Key 待申请）

- [x] T3.1 draft-order.ts（LLM JSON 模式 + 无 Key 规则解析兜底；R 前缀代码转换）
- [x] T3.2 riskCheck（仓位/偏离/冲突/阻断，冒烟验证：44% 仓位被标 bad、-40% 偏离被标 warn）
- [x] T3.3 orders 三端点 + 状态机 + audit_log（sign 前置校验 ✓）
- [x] T3.4 paper 下单对接 ✅ 9/9（`order` 动词 v3 契约适配：SPOT 市价买按 USDT 计价、限价/卖按股数；条件单不跨价映射为 GTC 限价、跨价止损型拒绝；rToken 在模拟盘缺席时转桌台模拟执行，巡检真实价格判定成交）
- [x] T3.5 前端计划卡 + 签字弹窗 + 挂单列表 + 30s 轮询
- [ ] T3.6 使用证明截图 #2（待 Demo Key + UI 截图）

## P4 · Chat 编排与整合（🔶 代码就绪 9/9，待 LLM Key 实测）

- [x] T4.1 provider.ts（OpenAI 兼容，Qwen/Claude 可切换）
- [x] T4.2 orchestrator.ts（6 轮工具循环 + 引用收集 + LlmUnavailable 诚实降级）
- [x] T4.3 /api/chat SSE（delta/citations/tool/error/done 五类事件）+ ChatMessage 组件
- [x] T4.4 跨模块入口（晨报卡"追问解读"→ chat?q=；"就此拟单"→ orders?q=）
- [ ] T4.5 全链路整夜试跑（带 LLM Key + Chat；建议 9/17–9/18）

## P4 后半 · Chat 实测项（✅ 2026-09-09 完成，提前 8 天）

- [x] T4.1–T4.4（见上，9/9 完成）
- [x] **T4.2/T4.3 LLM 实测** ✅ 9/9：Chat 工具循环真跑通——"RTSLAUSDT 现在多少钱"触发 4 工具链（行情→技术→新闻→情绪，含真实 RSI 57.29/恐惧贪婪 54），回答带引用与签字引导；SSE 五类事件正常
- [x] **晨报 AI 归因实测** ✅ 9/9：headline 真 AI 总结；why 段在事件不足时诚实标注"无法确认"（反幻觉 prompt 生效）
- [x] **LLM 拟单实测** ✅ 9/9："英伟达回踩 210 买 20 股" → RNVDAUSDT/buy/conditional/≤210/20股 + 风控（17% 仓位、-7.09% 偏离）
- [ ] T4.5 全链路**整夜**试跑（单次会话已通；建议 9/17–9/18 挂一夜验证晨报节奏）

## P5 · 部署与演示材料（9/19）

- [ ] **T5.1 Vercel 部署**（env 清单见 `.env.example`；cron 已配 `vercel.json`）
- [ ] **T5.2 演示兜底**（无数据示例晨报 + DEMO_MODE；当前模板降级路径已实现，需 UI 上标注验证）
- [ ] **T5.3 录屏 + 使用证明截图 #3**
- [ ] **T5.4 README 更新**（部署链接、录屏、路线图勾选、Quick Start 实测命令）

## P6 · 提交（9/20，9/21 缓冲）

- [ ] **T6.1 发 X 帖子**（先发帖后填表：项目名+一句话+截图+`#AgenticTrading` `#BuilderOS`）
- [ ] **T6.2 填提交表单 Q1–Q11**（Q7 六部分取材：PRD §1–3 / README 赋能表 / 架构 §1 / 原型闭环；Q8 用 `docs/proof/` 三件套；子主题二选一）
- [ ] **T6.3 缓冲日（9/21）**

---

## 剩余关键路径（按阻塞程度排序）

1. **用户操作**：Bitget Demo API Key 申请（T0.2）→ 解锁真实 paper 下单
2. **用户操作**：Qwen 申请表（⏰ 9/15 截止）+ `.env` 配 `LLM_API_KEY` → 解锁晨报 AI 归因 + Chat + LLM 拟单
3. 挂一夜跑 T2.7 整夜试跑（本地或部署后）
4. 部署 Vercel（注意：JSON 存储在 Vercel 上是易失的——演示期间用 Uptime Robot 定期 ping /api/cron/patrol 保活，或迁移到 KV）
5. 三件套截图 + 录屏 + X 帖子 + 表单

## 已知问题 / 技术债

- signal MCP 上游（RSS/情绪源）在当前网络环境返回空——已做校验+回落；**部署 Vercel 后必须复测**（T0.4 结论可能反转）
- `heuristicParse` 对 "RUNE" 类 R 开头山寨币有极小概率误判为 rToken（见 rtoken-coverage.md 注意事项）
- Chat 页刷新丢消息历史（历史在 server 端 chat_messages 表里有，未做加载）——P4 打磨项
- Watchlist UI 管理入口未做（API 已就绪）——P2 打磨项
