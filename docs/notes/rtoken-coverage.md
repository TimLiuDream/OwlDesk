# T0.3 · rToken 覆盖度实测结论

> 实测日期：2026-09-08 · 方法：`@bitget-ai/bitget-agent-sdk` v3.3.0，`market` verb `action:tickers category:SPOT`（公开数据，免 Key）

## 结论：覆盖度极佳，无需 fallback 方案

- Bitget 现货共有 **726 个 rToken 代币化标的**（代码格式 `R + 股票代码 + USDT`）
- 单标的行情查询验证通过（`RTSLAUSDT` ✓）
- **PRD 风险①关闭**：不做公开美股行情 fallback，全部数据走 Agent Hub

## 代码格式（重要）

| 用户会说 | Bitget 代码 |
|---|---|
| TSLA | `RTSLAUSDT` |
| NVDA | `RNVDAUSDT` |
| SPY / QQQ | `RSPYUSDT` / `RQQQUSDT` |
| MSTR / COIN | `RMSTRUSDT` / `RCOINUSDT` |

> 注意误判陷阱：正则 `[A-Z]+USDT` 会把普通山寨币（RLC、RSR、RUNE…）也当 rToken。判定规则用**显式名单或 R 前缀 + 已知股票代码**校验。`heuristicParse` 目前用 R 前缀推断，极小概率把 "RUNE" 误判为股票——演示时注意。

## 代表性标的（部分，价格实测于 2026-09-08）

热门个股：RTSLAUSDT 366.25 · RNVDAUSDT 225.53 · RAAPLUSDT 316.83 · RMSFTUSDT 493.81 · RMETAUSDT 614.65 · RGOOGLUSDT 338.90 · RAMZNUSDT 256.94 · RAMDUSDT 505.72 · RPLTRUSDT 170.73 · RMSTRUSDT 137.10 · RCOINUSDT 179.33 · RHOODUSDT 118.10

ETF：RSPYUSDT 765.70 · RQQQUSDT 717.91 · RARKKUSDT 86.33 · RSOXXUSDT 528.00 · RSMHUSDT 573.15（含杠杆/反向：RSOXL、RTQQQ、RSQQQ）

中概：RBABAUSDT · RPDDUSDT · RJDUSDT · RBIDUUSDT · RNTESUSDT · RBILIUSDT

## v3 Ticker 字段适配（实测）

返回字段为：`lastPrice` / `openPrice24h` / `highPrice24h` / `lowPrice24h` / `quoteVolume` / `ts`。
**没有 `change24h` 字段**，涨跌幅需 `(lastPrice - openPrice24h) / openPrice24h` 自算——已在 `lib/agenthub/market.ts` 适配。

## 默认 watchlist（WATCHLIST_SEED）

`RTSLAUSDT, RNVDAUSDT, RAAPLUSDT, RMSFTUSDT, RMETAUSDT`
