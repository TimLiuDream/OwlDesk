/**
 * Risk annotation (ARCHITECTURE.md §4.2 riskCheck, PRD C2).
 * Pure function: draft + positions + current price → risk block.
 * `blocked: true` means the sign endpoint refuses to submit.
 */

import type { OrderDraft } from "@/lib/db";

export interface RiskInput {
  side: "buy" | "sell";
  symbol: string;
  qty: number | null;
  order_type: "market" | "limit" | "conditional";
  limit_price?: number | null;
  trigger_price?: number | null;
  positions: Array<{ symbol: string; qty: number; markPrice: number; side?: string }>;
  equityUsdt: number;
  currentPrice: number | null;
}

export type RiskOutput = OrderDraft["risk_json"];

const MAX_POSITION_PCT_BLOCK = 80; // hard block above this
const WARN_POSITION_PCT = 40;
const MAX_DEVIATION_PCT = 10; // warn when trigger/limit deviates more than this from market

export function riskCheck(input: RiskInput): RiskOutput {
  const warnings: RiskOutput["warnings"] = [];
  const existing = input.positions.find((p) => p.symbol === input.symbol);
  const price = input.trigger_price ?? input.limit_price ?? input.currentPrice;
  const notional = input.qty !== null && price !== null ? input.qty * price : null;

  const positionPct =
    notional !== null && input.equityUsdt > 0
      ? Math.round(((notional + (existing ? existing.qty * existing.markPrice : 0)) / input.equityUsdt) * 100)
      : 0;

  const deviationPct =
    price !== null && input.currentPrice !== null && input.currentPrice > 0
      ? Math.round(((price - input.currentPrice) / input.currentPrice) * 10000) / 100
      : null;

  const conflictWithPositions =
    existing !== undefined &&
    ((input.side === "sell" && (existing.side ?? "long") === "long" && existing.qty <= 0) ||
      (input.side === "buy" && existing.side === "short"));

  let blocked = false;

  if (input.qty === null || input.qty <= 0) {
    warnings.push({ text: "数量未识别，签字前需人工确认", level: "warn" });
  }
  if (positionPct > MAX_POSITION_PCT_BLOCK) {
    warnings.push({ text: `目标仓位占比 ${positionPct}%，超出 ${MAX_POSITION_PCT_BLOCK}% 硬限制`, level: "bad" });
    blocked = true;
  } else if (positionPct > WARN_POSITION_PCT) {
    warnings.push({ text: `仓位占比 ${positionPct}% 偏高（>${WARN_POSITION_PCT}%），建议减量`, level: "bad" });
  }
  if (deviationPct !== null && Math.abs(deviationPct) > MAX_DEVIATION_PCT) {
    warnings.push({
      text: `触发/限价偏离现价 ${deviationPct > 0 ? "+" : ""}${deviationPct}%，请确认价格是否输入正确`,
      level: "warn",
    });
  }
  if (conflictWithPositions) {
    warnings.push({ text: "与现有持仓方向冲突", level: "warn" });
  }
  if (input.order_type === "market" && input.currentPrice === null) {
    warnings.push({ text: "市价单但当前行情不可用，成交价未知", level: "warn" });
  }
  if (input.symbol.endsWith("USDT") === false) {
    warnings.push({ text: "标的代码格式存疑（非 USDT 计价对）", level: "warn" });
  }
  if (warnings.length === 0) {
    warnings.push({ text: "未发现明显风险项", level: "info" });
  }

  return {
    positionPct,
    deviationPct,
    conflictWithPositions,
    warnings,
    blocked,
  };
}
