<div align="center">

# 🦉 OwlDesk

**The desk that never sleeps.（永不休眠的交易台）**

面向代币化美股的 24 小时研究台——
你在睡觉时它替你盯盘，你清醒时它把每个订单起草好等你签字。

[![Bitget AI Hackathon S2](https://img.shields.io/badge/Bitget%20AI%20Hackathon-Season%202-f5b544)](https://bitget.com/en/activity-hub/hackathon)
[![Track](https://img.shields.io/badge/赛道-AI%20Trading%20Desk-3ddbc4)](#-黑客松提交)
[![Built on](https://img.shields.io/badge/构建于-Bitget%20Agent%20Hub-6ea8ff)](https://github.com/Bitget-AI/agent_hub)

[English](./README.md) · [需求文档 PRD](./docs/PRD.md) · [技术架构](./docs/ARCHITECTURE.md) · [交互原型](./prototype/index.html)

</div>

---

## 问题

代币化美股（Bitget rToken）已经 7×24 交易——但**你**没有。对亚洲交易者来说，整个美股时段恰好发生在睡觉时间。醒来时，新闻已经不新，行情已经走完，反应窗口已经关闭。

现有工具在两个极端：全自动交易 Agent（真金白银不敢放手），或纯被动看板（活儿还是自己干）。

## 方案

OwlDesk 取中间态——**AI 处理一切，签字权在人。**

### 🌙 模块 A · 夜间晨报 Overnight Brief（信息提炼）

你睡觉时，OwlDesk 通过 Bitget Agent Hub 每 15–30 分钟巡检一次自选列表——价格异动、新闻流、情绪转变、财报事件。醒来时，一份结构化晨报已经就绪：

- **发生了什么** —— 逐标的隔夜行情 + 事件时间线
- **为什么** —— 新闻 + 情绪 + 宏观背景，每条断言带引用
- **今天看什么** —— 当日的决策点

而且晨报是可以追问的：问一句"NVDA 为什么跌？"，得到的是带数据引用的解读，不是一堆链接。

### ✍️ 模块 C · 拟单台 Order Draft Desk（执行辅助）

用一句自然语言——"TSLA 跌破 220 挂半仓止损"——OwlDesk 把它变成一张结构化订单计划卡：标的、方向、类型、数量、触发条件、有效期，并自动跑风控检查（仓位占比、与现有持仓的冲突、偏离现价幅度），然后**等你签字**。

> **AI 拟单，你签字。无签字，不下单。**

签字后的订单经 Agent Hub 的 `strategy_order` 提交到 Bitget **模拟盘**（paper trading），每次签字均审计留痕。

## Bitget Agent Hub 如何赋能 OwlDesk

OwlDesk 不自建数据管道——整个交易台长在 [Bitget Agent Hub](https://github.com/Bitget-AI/agent_hub)（89 个 UTA v3 操作）之上：

| 能力 | Agent Hub 组件 | 用途 |
|---|---|---|
| 行情数据 | `market` 模块（公开数据，免 Key） | rToken 美股价格、隔夜异动检测 |
| 宏观背景 | `bitget-signal` · `macro-analyst` | 晨报"为什么"的市场背景 |
| 新闻流 | `bitget-signal` · `news-briefing` | 事件时间线、晨报素材 |
| 市场情绪 | `bitget-signal` · `sentiment-analyst` | 简报与计划卡的情绪标注 |
| 技术面 | `bitget-signal` · `technical-analysis` | 追问解读的引用、触发位参考 |
| 持仓账户 | `account` 模块 + **`--read-only`** | 基于持仓的仓位风险标注 |
| 订单执行 | `trade` · `strategy_order` + **`--paper-trading`** | 仅限已签字订单 |

**安全姿态**：分析侧全程只读语义；唯一的写路径是签字端点；执行侧只使用 Demo API Key；API Key 仅存环境变量。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Next.js（App Router）· TypeScript · TailwindCSS |
| 后端 | Next.js API Routes · SSE 流式输出 |
| LLM | Qwen（OpenAI 兼容）/ Claude，provider 可切换 |
| Agent 层 | `@bitget-ai/bitget-agent-sdk` · `bitget-signal` · MCP |
| 存储 | SQLite（演示规模） |
| 调度 | Vercel Cron —— 夜间巡检 + 晨报生成 |
| 部署 | Vercel |

完整设计见[技术架构文档](./docs/ARCHITECTURE.md)：API 规格、订单"起草→风控→签字→提交"流程、数据模型与安全模型。

## 仓库结构

```
OwlDesk/
├── README.md / README.zh-CN.md   ← 当前文件
├── docs/
│   ├── PRD.md                    # 需求文档与功能规格
│   └── ARCHITECTURE.md           # 前后端技术架构设计
└── prototype/
    └── index.html                # 浏览器直接打开 —— 交互式 UI 原型
```

## 快速体验（原型）

目前无需构建——直接打开交互原型：

```bash
# 用任意浏览器打开即可
start prototype/index.html        # Windows
# 或：open prototype/index.html   # macOS
```

可以走完整个闭环：读夜间晨报 → 对话追问 → 自然语言拟单 → 审阅风险标注 → 签字 → 查看模拟盘提交结果。

Next.js 正式实现正按[架构文档](./docs/ARCHITECTURE.md)推进中，目标黑客松截止日（9/21）。

## 🏁 黑客松提交

- **活动**：Bitget AI Hackathon Season 2 —— "Build What Trades Next"
- **赛道**：AI Trading Desk（投研看板）
- **子主题**：信息提炼 / 执行辅助
- **硬性要求**：可访问的部署链接 ✓（计划中）· Agent Hub 使用证明 ✓ · X 帖子含 `#AgenticTrading` `#BuilderOS` ✓（提交前发布）

## 路线图

- [x] 需求文档 & 架构设计
- [x] 交互式 UI 原型
- [ ] Agent Hub 接入层（market + signal 五技能，Demo Key）
- [ ] 夜间巡检 & 晨报流水线
- [ ] 拟单台与签字流程
- [ ] Chat 编排器
- [ ] Vercel 部署 + 演示视频

## 许可证

MIT
