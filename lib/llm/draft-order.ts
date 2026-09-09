/**
 * NL → structured order plan (ARCHITECTURE.md §4.2, draft-order.ts).
 * Uses LLM JSON mode; on any failure returns null so the API can ask the
 * user to rephrase. NEVER places orders.
 */

import { chatCompletion, LlmUnavailableError } from "./provider";
import { draftOrderSystemPrompt } from "./prompts";

export interface ParsedOrderPlan {
  symbol: string | null;
  side: "buy" | "sell";
  order_type: "market" | "limit" | "conditional";
  qty: number | null;
  limit_price: number | null;
  trigger_cond: "price>=" | "price<=" | null;
  trigger_price: number | null;
  tif: string;
  rationale: string;
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function asSide(v: unknown): "buy" | "sell" {
  return v === "sell" ? "sell" : "buy";
}

function asOrderType(v: unknown): "market" | "limit" | "conditional" {
  return v === "limit" || v === "conditional" ? v : "market";
}

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number(v.replace(/[,$%\s]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asTrigger(v: unknown): "price>=" | "price<=" | null {
  return v === "price>=" || v === "price<=" ? v : null;
}

/** Rule-based fallback so drafting still works without an LLM key. */
function heuristicParse(text: string): ParsedOrderPlan | null {
  const t = text.toLowerCase();
  const sell = /(卖出|做空|止损|清仓|sell|short)/.test(t);
  const conditional = /(跌破|跌破|高于|低于|回踩|触发|突破|below|above|hits?)/.test(t);
  const limit = /(限价|挂单|limit)/.test(t);

  const symMatch = text.toUpperCase().match(/\b(R?[A-Z]{1,6})(USDT)?\b/);
  let symbol: string | null = null;
  if (symMatch) {
    const rawSym = symMatch[1];
    // rToken format is R+TICKER+USDT (e.g. RTSLAUSDT); bare TSLA → RTSLAUSDT
    symbol = rawSym.startsWith("R") ? rawSym + "USDT" : "R" + rawSym + "USDT";
  }

  const priceMatch = t.match(/(\d{2,6}(?:\.\d+)?)/);
  const price = priceMatch ? Number(priceMatch[1]) : null;

  const qtyMatch = t.match(/(\d{1,6})\s*(?:股|份|个|张|shares?)/) ?? t.match(/买(?:入)?\s*(\d{1,6})/);

  return {
    symbol,
    side: sell ? "sell" : "buy",
    order_type: conditional ? "conditional" : limit ? "limit" : "market",
    qty: qtyMatch ? Number(qtyMatch[1]) : null,
    limit_price: !conditional && price !== null ? price : null,
    trigger_cond: conditional ? (sell ? "price<=" : "price<=") : null,
    trigger_price: conditional ? price : null,
    tif: "GTC",
    rationale: text.slice(0, 120),
  };
}

export async function parseOrderPlan(userText: string): Promise<ParsedOrderPlan> {
  try {
    const res = await chatCompletion(
      [
        { role: "system", content: draftOrderSystemPrompt() },
        { role: "user", content: userText },
      ],
      { jsonMode: true, temperature: 0 },
    );
    const raw = res.choices?.[0]?.message?.content ?? "";
    const json = extractJson(raw);
    if (!json) return heuristicParse(userText) as ParsedOrderPlan;

    const plan: ParsedOrderPlan = {
      symbol: typeof json.symbol === "string" && json.symbol ? json.symbol.toUpperCase() : null,
      side: asSide(json.side),
      order_type: asOrderType(json.order_type),
      qty: asNum(json.qty),
      limit_price: asNum(json.limit_price),
      trigger_cond: asTrigger(json.trigger_cond),
      trigger_price: asNum(json.trigger_price),
      tif: typeof json.tif === "string" ? json.tif : "GTC",
      rationale: typeof json.rationale === "string" ? json.rationale : userText.slice(0, 120),
    };
    return plan;
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      const fallback = heuristicParse(userText);
      if (fallback) return fallback;
    }
    throw e;
  }
}
