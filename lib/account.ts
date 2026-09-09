/**
 * Shared account context (positions + equity) for risk annotation.
 * Reads live from the readonly Agent Hub instance when credentials exist
 * (paper balances), otherwise falls back to clearly-labeled demo data.
 * Single source for orders route, orchestrator draft tool, and sign route —
 * so positionPct is computed off the SAME equity everywhere.
 */

import { getReadonlyHub } from "@/lib/agenthub/client";

export interface Position {
  symbol: string;
  qty: number;
  markPrice: number;
  side?: string;
}

export interface AccountContext {
  positions: Position[];
  equityUsdt: number;
  demo: boolean;
}

const DEMO_POSITIONS: Position[] = [
  { symbol: "RTSLAUSDT", qty: 25, markPrice: 224.8, side: "long" },
  { symbol: "RNVDAUSDT", qty: 10, markPrice: 172.4, side: "long" },
  { symbol: "RSPYUSDT", qty: 5, markPrice: 5480, side: "long" },
];

function demoEquity(): number {
  const n = Number(process.env.DEMO_EQUITY_USDT || 50000);
  return Number.isFinite(n) && n > 0 ? n : 50000;
}

export async function getAccountContext(): Promise<AccountContext> {
  const hub = await getReadonlyHub();
  if (hub.ok) {
    try {
      const res = await hub.invoke("account_overview", { action: "balances" });
      if (res && res.ok) {
        const data = res.data as {
          assets?: { data?: { assets?: Array<Record<string, string>>; usdtEquity?: string } };
        };
        const rawList = data?.assets?.data?.assets ?? [];
        const positions = rawList
          .map((r) => ({
            symbol: String(r.coin === "USDT" ? "" : (r.coin ?? "")).toUpperCase(),
            qty: Number(r.available ?? r.frozen ?? 0),
            markPrice: Number(r.uAmount ?? 0) / Math.max(Number(r.available ?? 0), 1e-9),
            side: "long",
          }))
          .filter((p) => p.symbol && p.symbol !== "USDT" && p.qty > 0);
        const usdtAvail = Number(rawList.find((r) => r.coin === "USDT")?.available ?? 0);
        const assetsData = data?.assets?.data;
        const equityRaw = Number(assetsData?.usdtEquity);
        const equity = equityRaw > 0 ? equityRaw : usdtAvail;
        if (equity > 0) {
          return { positions, equityUsdt: equity, demo: false };
        }
      }
    } catch {
      // fall through to demo
    }
  }
  return { positions: DEMO_POSITIONS, equityUsdt: demoEquity(), demo: true };
}
