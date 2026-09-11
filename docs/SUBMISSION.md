# OwlDesk 报名表预填稿（forms.gle/GyWZCMCPocgJdJon6）

> 用法：【待填】处是你的个人信息；其余直接复制。
> 提交前检查：X 帖子已公开可见 ✓ 部署链接可访问 ✓

---

**Q1 姓名**：【待填：你的名字（新注册用户需写 X 用户名）】

**Q2 X 帖子链接**：【待填：第一篇 build in public 推文链接】
（已核对：含项目名 ✓ 截图 ✓ `#AgenticTrading` `#BuilderOS` ✓；后续如发正式参赛帖，可换成那篇的链接）

**Q3 项目名（英文）**：
```
OwlDesk
```

**Q4 赛道**：
```
AI Trading Desk（投研看板）
```

**Q5 合作团队**：【待填：单人就写自己；≤4 人需每人有 Bitget 账户】

**Q6 项目部署链接**：
```
https://owldesk.timliu.xyz
```

**Q7 项目描述**（六部分，约 900 字符，≤1000 限制内）：

```
Problem: Tokenized US stocks (Bitget rToken) trade 7×24, but traders don't. For Asian users the entire US session happens while they sleep — overnight moves, news and earnings go unwatched, and the reaction window is closed by morning. Existing tools are either fully autonomous (hard to trust) or passive dashboards (all the work is still yours).

Solution: OwlDesk is a 24-hour research desk that takes the middle path — AI handles everything, the human holds the pen. Module A "Overnight Brief": while you sleep, it patrols your watchlist every 15 minutes (price moves, news, sentiment), then generates a structured morning brief (what happened / why / what to watch) that you can interrogate in natural language with cited answers. Module C "Order Draft Desk": say "buy TSLA if it dips below 350" in plain language — AI drafts a structured order plan card with automatic risk annotations (position %, deviation, conflicts), waits for your signature, then submits to Bitget paper trading.

Agent capabilities: perceive (Agent Hub market feed + bitget-signal 5 skills: macro/on-chain/sentiment/technical/news), interpret (LLM attribution with mandatory citations — no-source claims are forbidden at the prompt level), draft (NL → structured order plan, zero execution capability in the chat path).

Tech architecture: Next.js 14 full-stack (3 views + 8 API routes), @bitget-ai/bitget-agent-sdk dual instances (read-only for analysis, paper-trading Demo Key for execution), bitget-signal public MCP, Qwen-class LLM behind an OpenAI-compatible interface, JSON store, Vercel-style cron replaced by a pm2 patrol driver on a HK VPS behind Cloudflare.

Usage flow: set your watchlist → sleep → wake up to the overnight brief → ask follow-ups in chat → say "draft me an order" → review the risk annotations → sign → order lands on Bitget paper trading with an auditable orderId.

How Bitget Agent Hub empowers us: the entire desk sits on Agent Hub's 89 UTA v3 operations — market feeds power the patrol, the five signal skills power the brief, account (read-only) powers risk annotation, and trade/strategy_order (paper) is the single write path, gated by human signature. Analysis is read-only by construction; the only way an order exists is Draft → Sign → Submit.
```

**Q8 Agent Hub / Playbook 使用证明**：上传以下截图（在 `OwlDesk/docs/proof/`）：
- `01-overnight-brief.png`（晨报页——数据来自 Agent Hub market 模块 + signal 五技能）
- `04-orders-signed.png`（签字后已提交模拟盘，含真实 orderId 1481833042236821504）
- 备选加分：服务器 `pm2 logs owldesk-patrol` 的 15 分钟巡检记录截图

**Q9 邮箱**：【待填】

**Q10 Qwen 30U 申请**：`Yes`（已于 2026-09-09 提交申请，等待发放）

**Q11 学校信息**：【待填：仅高校奖需要；非学生可留空】
