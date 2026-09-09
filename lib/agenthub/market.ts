/**
 * Market snapshot helper over the Agent Hub `market` intent verb.
 * Public data — no API key required (per agent-sdk README).
 */

import { getReadonlyHub } from "./client";

export interface MarketSnapshot {
  symbol: string;
  price: number | null;
  changePct: number | null; // 24h change
  high24h: number | null;
  low24h: number | null;
  volumeUsdt: number | null;
  ts: string; // ISO
  source: "agenthub" | "demo";
}

const DEMO_BASE: Record<string, { p: number; c: number }> = {
  RTSLAUSDT: { p: 224.8, c: 1.83 },
  RNVDAUSDT: { p: 172.4, c: -2.31 },
  RAAPLUSDT: { p: 231.15, c: -0.62 },
  RMSFTUSDT: { p: 418.3, c: 0.41 },
  RMETAUSDT: { p: 512.6, c: 0.87 },
};

function demoSnapshot(symbol: string): MarketSnapshot {
  const base = DEMO_BASE[symbol] ?? { p: 100 + (symbol.length * 7) % 90, c: 0.5 };
  // small deterministic-ish jitter so demo patrols still produce "moves"
  const jitter = ((Date.now() / 60_000) % 7) / 100; // ±~0.07
  const price = Math.round((base.p * (1 + jitter)) * 100) / 100;
  return {
    symbol,
    price,
    changePct: base.c,
    high24h: price * 1.01,
    low24h: price * 0.99,
    volumeUsdt: 1_234_567,
    ts: new Date().toISOString(),
    source: "demo",
  };
}

/** Bitget v3 spot ticker fields (verified live 2026-09-08). */
interface TickerLike {
  symbol?: string;
  lastPrice?: string;
  openPrice24h?: string;
  highPrice24h?: string;
  lowPrice24h?: string;
  baseVolume?: string;
  quoteVolume?: string;
  usdtVolume?: string;
  ts?: string | number;
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeTicker(t: TickerLike): MarketSnapshot {
  const price = num(t.lastPrice);
  const open = num(t.openPrice24h);
  const changePct =
    price !== null && open !== null && open > 0 ? ((price - open) / open) * 100 : null;
  return {
    symbol: t.symbol ?? "",
    price,
    changePct: changePct !== null ? Math.round(changePct * 100) / 100 : null,
    high24h: num(t.highPrice24h),
    low24h: num(t.lowPrice24h),
    volumeUsdt: num(t.usdtVolume) ?? num(t.quoteVolume) ?? num(t.baseVolume),
    ts: t.ts ? new Date(Number(t.ts) || t.ts).toISOString() : new Date().toISOString(),
    source: "agenthub",
  };
}

export async function getSnapshots(symbols: string[]): Promise<MarketSnapshot[]> {
  if (symbols.length === 0) return [];
  const hub = await getReadonlyHub();

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      if (!hub.ok) return demoSnapshot(symbol);
      try {
        const res = await hub.invoke("market", {
          action: "tickers",
          category: "SPOT",
          symbol,
        });
        // agent-sdk SafeResult: { ok: true, data } | { ok: false, error }
        if (res && res.ok) {
          const data = res.data as { list?: TickerLike[] } | TickerLike[] | undefined;
          const list = Array.isArray(data) ? data : data?.list;
          const ticker = list?.[0];
          if (ticker && num(ticker.lastPrice) !== null) {
            return normalizeTicker({ ...ticker, symbol: ticker.symbol ?? symbol });
          }
        }
        return demoSnapshot(symbol);
      } catch {
        return demoSnapshot(symbol);
      }
    }),
  );
  return results;
}
