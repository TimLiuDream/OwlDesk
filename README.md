<div align="center">

# 🦉 OwlDesk

**The desk that never sleeps.**

A 24-hour research desk for tokenized US stocks —
it watches the market while you sleep, and drafts every order for your signature while you're awake.

[![Bitget AI Hackathon S2](https://img.shields.io/badge/Bitget%20AI%20Hackathon-Season%202-f5b544)](https://bitget.com/en/activity-hub/hackathon)
[![Track](https://img.shields.io/badge/Track-AI%20Trading%20Desk-3ddbc4)](#-hackathon-submission)
[![Built on](https://img.shields.io/badge/Built%20on-Bitget%20Agent%20Hub-6ea8ff)](https://github.com/Bitget-AI/agent_hub)

[中文文档](./README.zh-CN.md) · [PRD](./docs/PRD.md) · [Architecture](./docs/ARCHITECTURE.md) · [Interactive Prototype](./prototype/index.html)

</div>

---

## The Problem

Tokenized US stocks (Bitget rToken) trade 7×24 — but **you** don't. For traders in Asia, the entire US session happens while they sleep. By the time they wake up, the news is old, the move is over, and the reaction window is closed.

Existing tools sit at two extremes: fully-automated trading agents (hard to trust with real money) or passive dashboards (hard work left to you).

## The Solution

OwlDesk takes the middle path — **AI handles everything, but you hold the pen.**

### 🌙 Module A · Overnight Brief *(information distillation)*

While you sleep, OwlDesk patrols your watchlist every 15–30 minutes via the Bitget Agent Hub — price moves, news flow, sentiment shifts, earnings events. When you wake up, a structured morning brief is waiting:

- **What happened** — overnight moves per ticker, with an event timeline
- **Why** — news + sentiment + macro context, every claim cited
- **What to watch** — today's decision points

And it's a conversation: ask *"why did NVDA drop?"* and get a cited answer, not a link dump.

### ✍️ Module C · Order Draft Desk *(execution assist)*

Say *"draft a stop-loss for TSLA below 220, half position"* in plain language. OwlDesk turns it into a structured order plan card — symbol, side, type, quantity, trigger, validity — runs automatic risk checks (position size, conflict with existing holdings, deviation from market), and **waits for your signature**.

> **AI drafts. You sign. No signature, no order.**

Signed orders go to Bitget **paper trading** through Agent Hub's `strategy_order`. Every signature is audit-logged.

## How Bitget Agent Hub Empowers OwlDesk

OwlDesk doesn't build its own data plumbing — the entire desk sits on the [Bitget Agent Hub](https://github.com/Bitget-AI/agent_hub) (89 UTA v3 operations):

| Capability | Agent Hub component | Used for |
|---|---|---|
| Market data | `market` module (public, no key) | rToken US-stock prices, overnight move detection |
| Macro context | `bitget-signal` · `macro-analyst` | the "why" behind overnight moves |
| News flow | `bitget-signal` · `news-briefing` | event timeline, brief material |
| Sentiment | `bitget-signal` · `sentiment-analyst` | sentiment tags in briefs & plan cards |
| Technicals | `bitget-signal` · `technical-analysis` | cited follow-up answers, trigger levels |
| Positions | `account` module + **`--read-only`** | position-based risk annotation |
| Order execution | `trade` · `strategy_order` + **`--paper-trading`** | signed orders only |

**Security posture:** analysis runs with read-only semantics; the only write path is the sign-off endpoint; execution uses a Demo API key exclusively; API keys live in environment variables only.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) · TypeScript · TailwindCSS |
| Backend | Next.js API Routes · SSE streaming |
| LLM | Qwen (OpenAI-compatible) / Claude — swappable provider |
| Agent layer | `@bitget-ai/bitget-agent-sdk` · `bitget-signal` · MCP |
| Storage | SQLite (demo scale) |
| Scheduling | Vercel Cron — overnight patrol + brief generation |
| Deployment | Vercel |

See [Architecture](./docs/ARCHITECTURE.md) for the full design: API specs, the order draft→risk→sign→submit flow, data model, and the security model.

## Repository Map

```
OwlDesk/
├── README.md / README.zh-CN.md   ← you are here
├── docs/
│   ├── PRD.md                    # requirements & feature specs (zh)
│   └── ARCHITECTURE.md           # frontend/backend technical design (zh)
└── prototype/
    └── index.html                # open in browser — interactive UI prototype
```

## Quick Start (prototype)

No build needed yet — open the interactive prototype directly:

```bash
# just open it in any browser
start prototype/index.html        # Windows
# or: open prototype/index.html   # macOS
```

You can walk the full loop: read the overnight brief → ask follow-up questions in chat → draft an order in plain language → review the risk annotations → sign → see it submitted to paper trading.

The Next.js implementation is being built against the [architecture doc](./docs/ARCHITECTURE.md) for the hackathon deadline.

## 🏁 Hackathon Submission

- **Event**: Bitget AI Hackathon Season 2 — "Build What Trades Next"
- **Track**: AI Trading Desk (investment research tooling)
- **Sub-theme**: Information Distillation / Execution Assist
- **Hard requirements covered**: live deployment link ✓ (planned) · Agent Hub usage proof ✓ · X post with `#AgenticTrading` `#BuilderOS` ✓ (pre-submission)

## Roadmap

- [x] PRD & architecture design
- [x] Interactive UI prototype
- [ ] Agent Hub integration layer (market + signal skills, Demo Key)
- [ ] Overnight patrol & brief pipeline
- [ ] Order draft desk with sign-off flow
- [ ] Chat orchestrator
- [ ] Vercel deployment + demo video

## License

MIT
