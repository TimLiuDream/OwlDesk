# OwlDesk — 前后端技术架构文档

> 配套文档：[PRD.md](./PRD.md)（需求） · [../prototype/index.html](../prototype/index.html)（交互原型）
> 版本 v0.1 · 2026-09-08

---

## 1. 总体架构

```
┌─────────────────────────── 浏览器 ───────────────────────────┐
│  Next.js 前端（App Router / React 18 / TailwindCSS）           │
│  晨报 Dashboard  ·  Chat  ·  拟单台（计划卡+签字）· 挂单列表      │
└──────────────────────────────┬──────────────────────────────┘
                               │ fetch / SSE
┌──────────────────────────────▼──────────────────────────────┐
│  Next.js API Routes（Node runtime，后端）                      │
│  /api/chat  /api/brief  /api/orders  /api/watchlist  /api/cron │
│                                                              │
│  ┌─ LLM 编排层 ──────────────┐   ┌─ 调度层 ────────────────┐  │
│  │ orchestrator（function    │   │ patrol：夜间巡检(15-30m) │  │
│  │ calling 循环 + 工具注册表)  │   │ brief：时段结束生成晨报   │  │
│  └──────────┬────────────────┘   └──────────┬───────────────┘  │
│             │                               │                  │
│  ┌──────────▼───────────────────────────────▼───────────────┐ │
│  │  Agent Hub 接入层（唯一的对外数据/执行通道）                  │ │
│  │  · bitget-agent-sdk 只读实例（market / account）           │ │
│  │  · bitget-signal 五技能（免 Key：宏观/链上/情绪/技术/新闻）  │ │
│  │  · bitget-agent-sdk paper 实例（Demo Key，strategy_order） │ │
│  └──────────────────────────┬───────────────────────────────┘ │
│  SQLite（better-sqlite3）     │                                 │
│  watchlist / events / briefs │                                 │
│  order_drafts / chat_logs    │                                 │
└──────────────────────────────┼─────────────────────────────────┘
                               ▼
                    Bitget UTA v3 API（含 rToken 美股）
```

**分层原则**：
1. **Agent Hub 接入层是唯一通道**——任何代码不得绕过它直接调 Bitget API（便于统一限流、签名、模式切换、演示截图）。
2. **写路径最小化**——分析侧只挂只读工具；唯一的写操作是 `submit_signed_order`，且必须携带已签字的 draft id。
3. **LLM 只编排不直连**——模型通过工具调用取数和下单，不把 API Key 或原始请求暴露给 prompt。

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | Next.js 14+（App Router）+ TypeScript | 前后端一体，Vercel 一键部署 |
| UI | TailwindCSS + shadcn/ui | 快速出成品观感 |
| 服务端状态 | TanStack Query | 晨报/订单列表轮询 |
| LLM | Qwen API（OpenAI 兼容协议，用 30U 赞助额度）| 可切换 Claude，抽象成 `lib/llm/provider.ts` |
| 存储 | SQLite（better-sqlite3）| 演示级够用；部署侧若 Vercel 不持久化则退化为 JSON 文件或 Vercel KV |
| 调度 | Vercel Cron（`vercel.json`）| 兜底：本地 node-cron 常驻进程 |
| Agent Hub | `@bitget-ai/bitget-agent-sdk` + `bitget-signal` | Node ≥20 |

## 3. 目录结构

```
OwlDesk/
├── app/
│   ├── page.tsx                    # 晨报 Dashboard（默认首页）
│   ├── chat/page.tsx               # 对话
│   ├── orders/page.tsx             # 拟单台：起草 + 计划卡 + 挂单列表
│   └── api/
│       ├── chat/route.ts           # POST：SSE 流式对话（编排器入口）
│       ├── brief/route.ts          # GET?date= 晨报；POST 手动触发生成
│       ├── events/route.ts         # GET?symbol=&window= 事件时间线
│       ├── watchlist/route.ts      # GET/POST/DELETE
│       ├── orders/route.ts         # GET 列表；POST NL→生成计划卡(draft)
│       ├── orders/[id]/sign/route.ts   # POST 签字→paper 下单（唯一写路径）
│       ├── orders/[id]/cancel/route.ts # POST 撤单
│       └── cron/patrol/route.ts    # 定时巡检（Vercel Cron 调用）
├── lib/
│   ├── agenthub/
│   │   ├── client.ts               # SDK 双实例：readonly / paper
│   │   ├── tools.ts                # LLM 工具注册表（schema→实现）
│   │   └── signal.ts               # bitget-signal 五技能封装
│   ├── llm/
│   │   ├── provider.ts             # Qwen/Claude 抽象
│   │   ├── orchestrator.ts         # 对话循环：工具调用→汇总→SSE
│   │   ├── prompts.ts              # 系统提示词（简报体例/计划卡体例）
│   │   └── draft-order.ts          # NL→结构化订单计划（结构化输出）
│   ├── jobs/
│   │   ├── patrol.ts               # 巡检：拉行情/新闻→阈值→落 events 表
│   │   └── brief.ts                # 晨报生成：events 汇总→LLM 体例化
│   └── db/
│       ├── schema.sql
│       └── index.ts
├── components/
│   ├── BriefCard.tsx               # 单标的晨报卡（三段式）
│   ├── OrderPlanCard.tsx           # 计划卡（参数+风险标注+签字按钮）
│   ├── SignDialog.tsx              # 签字确认弹窗（二次确认+留痕提示）
│   ├── Timeline.tsx                # 夜间事件时间线
│   └── ChatMessage.tsx             # 含引用标注的消息体
├── docs/                           # PRD.md / ARCHITECTURE.md
├── prototype/index.html            # 静态交互原型（本仓库当前阶段产物）
├── vercel.json                     # crons 配置
└── .env.example
```

## 4. 后端 API 设计

统一约定：JSON；错误 `{ error: { code, message } }`；鉴权演示阶段不做（部署页只读可见），写接口预留 `DEMO_MODE` 开关。

### 4.1 `POST /api/chat`（SSE）
```jsonc
// req
{ "sessionId": "s1", "message": "NVDA 为什么跌？" }
// SSE 事件流
data: {"type":"delta","text":"昨晚 NVDA 收跌 2.3%…"}
data: {"type":"citations","items":[{"kind":"price","ts":"2026-09-08T21:00Z","value":"-2.3%"},{"kind":"news","title":"大摩下调评级","url":"…"}]}
data: {"type":"tool","name":"get_news","ok":true,"ms":820}   // 调试可见
data: {"type":"action","kind":"draft_order","draftId":"d_42"}  // 对话内拟单
data: {"type":"done"}
```
编排器循环：组装上下文（watchlist + 当日 brief 摘要 + 只读持仓）→ LLM function calling → 最多 6 轮工具调用 → 流式输出。

### 4.2 订单流（核心安全路径）
```
POST /api/orders            { "text": "TSLA 跌破 220 挂半仓止损" }
  → LLM 结构化输出（draft-order.ts）→ 落库 status=draft
  → 自动跑风险标注 riskCheck() → 返回计划卡
POST /api/orders/:id/sign   {}   // 前置校验：status=draft 且 risk 未阻断
  → paper 实例调 strategy_order → 回写 agenthub_ref，status=submitted
POST /api/orders/:id/cancel {}   → status=canceled（审计留痕）
GET  /api/orders?status=            → 列表（含状态轮询刷新）
```

**计划卡数据结构**（draft-order.ts 的结构化输出 schema）：
```jsonc
{
  "symbol": "TSLA",
  "side": "buy" | "sell",
  "orderType": "market" | "limit" | "conditional",
  "qty": 25,
  "limitPrice": 220.0,          // limit/conditional
  "trigger": { "cond": "price<=", "price": 220.0 },  // conditional
  "tif": "GTC",
  "rationale": "晨报提及交付数据超预期，回踩接仓",
  "risk": {
    "positionPct": 48,          // 目标仓位占比 %
    "deviationPct": -1.2,       // 触发价偏离现价
    "conflictWithPositions": false,
    "warnings": ["仓位占比偏高（>40%）"]
  }
}
```

### 4.3 其余端点
| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/brief?date=` | GET | 当日晨报（summary_json：总览+逐标的三段式+今日关注）|
| `/api/brief` | POST | 手动触发生成（演示时不必等收盘）|
| `/api/events?symbol=&window=` | GET | 时间线：type ∈ price_move / news / earnings / sentiment |
| `/api/watchlist` | GET/POST/DELETE | 关注列表管理 |
| `/api/cron/patrol` | POST(cron) | 巡检：行情异动(|Δ|>1.5%)+新闻拉取→events |

## 5. Agent Hub 接入层

### 5.1 SDK 双实例（client.ts）
```ts
// 分析：只读（不挂任何写工具）
const readonlyHub = createAgentHub({ mode: "read-only", modules: ["market", "account"] });
// 执行：Demo Key + paper trading（唯一写路径专用）
const paperHub = createAgentHub({ mode: "paper-trading", modules: ["trade"] });
// env: BITGET_DEMO_API_KEY / BITGET_DEMO_SECRET / BITGET_DEMO_PASSPHRASE
```

### 5.2 LLM 工具注册表（tools.ts）
| 工具名 | 底层 | 模块/动词 |
|---|---|---|
| `get_market_snapshot(symbols)` | SDK 只读实例 | `market` |
| `get_positions()` | SDK 只读实例 | `account_overview` |
| `get_news(symbol, window)` | bitget-signal | `news-briefing` |
| `get_sentiment(symbol)` | bitget-signal | `sentiment-analyst` |
| `get_technical(symbol)` | bitget-signal | `technical-analysis` |
| `get_macro()` | bitget-signal | `macro-analyst` |
| `submit_signed_order(draftId)` | paper 实例 | `strategy_order`（仅 sign 端点可调）|

> 原则：`submit_signed_order` 不注册进 chat 编排器——对话里的"下单"只能产出 draft，签字必须走 UI。

### 5.3 signal 技能封装（signal.ts）
免 Key、走公共行情 MCP。统一返回 `{ headline, keyPoints[], sources[], asOf }` 供引用标注。实测后按输出质量分配晨报权重（PRD 风险项 2）。

## 6. 数据模型（schema.sql）

```sql
watchlist(id PK, symbol UNIQUE, name, created_at);
overnight_events(id PK, symbol, ts_et, type, title, detail, source_url,
                 price, change_pct, created_at);
briefs(id PK, date UNIQUE, generated_at, summary_json, status);
order_drafts(id PK, created_at, raw_text, symbol, side, order_type, qty,
             limit_price, trigger_cond, trigger_price, tif, rationale,
             risk_json, status,        -- draft/signed/submitted/filled/canceled/rejected
             signed_at, agenthub_ref);
chat_messages(id PK, session_id, role, content, citations_json, created_at);
audit_log(id PK, ts, action, entity_id, actor, detail);   -- 签字/撤单全留痕
```

## 7. 调度与任务

| 任务 | 触发 | 逻辑 |
|---|---|---|
| patrol 巡检 | Vercel Cron 每 15 分钟（美东 9:30–16:00 窗口内生效，非窗口直接返回）| 拉 watchlist 行情 → 异动阈值 → `get_news` 增量 → 落 `overnight_events` |
| brief 生成 | Cron 每日收盘后 1 次 + `POST /api/brief` 手动 | events 按标的聚合 → prompts 简报体例 → 落 `briefs` |
| 订单状态轮询 | 前端 TanStack Query 30s 轮询 `GET /api/orders?status=submitted` | 同步 agenthub_ref 状态 |

时区注意：调度窗口按 America/New_York 计算，展示层按用户本地时区（演示主打亚洲用户"醒来读晨报"）。

## 8. 安全设计

1. **Key 管理**：全部环境变量；Demo Key 独立命名空间（`BITGET_DEMO_*`），绝不混用真实 Key。
2. **两步签字**：LLM 任何输出都不能直接产生订单；`sign` 端点是唯一写路径，且校验 draft 状态与风险阻断项。
3. **权限最小化**：分析实例 `--read-only` 语义（只挂 market/account）；执行实例只有 `trade` 模块。
4. **审计**：签字、撤单、提交全部落 `audit_log`（actor=用户，附 raw draft 快照）。
5. **引用反幻觉**：晨报与追问回答强制带 citations（行情带时间戳、新闻带 URL），无来源的断言在 prompt 层禁止。

## 9. 部署（Vercel）

```jsonc
// vercel.json
{ "crons": [
  { "path": "/api/cron/patrol", "schedule": "*/15 * * * *" },
  { "path": "/api/cron/brief",  "schedule": "0 21 * * 1-5" }   // 美东收盘≈北京 4:00，示例按实际调
]}
```
env 清单：`LLM_API_KEY`、`LLM_BASE_URL`、`BITGET_DEMO_API_KEY/SECRET/PASSPHRASE`、`DEMO_MODE=1`。
演示策略：首页晨报用最近一晚真实巡检数据；无数据时回退到"示例晨报"（标注演示数据），保证评审随时打开都有内容。

## 10. 开发顺序（对齐 PRD 第 8 节排期）

1. **D1–D2**：脚手架 + `lib/agenthub` 跑通（行情快照、signal 调用、Demo Key 验证）→ **产出使用证明截图 #1**
2. **D3–D5**：巡检 + 晨报 + BriefCard 页面
3. **D6–D8**：draft-order + 风险标注 + 签字流 + paper 下单 → **使用证明截图 #2**
4. **D9–D10**：Chat 编排整合 + 全链路真实数据试跑
5. **D11**：部署 + 录屏 → **使用证明截图 #3**
6. **D12**：X 帖子 + 表单提交
