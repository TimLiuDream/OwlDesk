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
  /** false when the live quote failed and we only have demo-price data */
  marketDataLive?: boolean;
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

  // 数量未识别/非法是硬阻断：签字前拦下，而不是让交易所在签字后报 400
  if (input.qty === null || input.qty <= 0) {
    warnings.push({ text: "数量未识别或非法，必须在签字前补全", level: "bad" });
    blocked = true;
  }
  if (input.marketDataLive === false) {
    warnings.push({
      text: "实时行情不可用（当前为演示数据），仓位/偏离指标为估算值",
      level: "warn",
    });
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
  } else if (existing && input.side === "buy" && (existing.side ?? "long") === "long" && input.equityUsdt > 0) {
    const existingPct = Math.round(((existing.qty * existing.markPrice) / input.equityUsdt) * 100);
    warnings.push({
      text: `与现有持仓同向叠加：该标的已占 ${existingPct}%，本单后合计 ${positionPct}%`,
      level: "warn",
    });
  } else if (existing && input.side === "sell" && (existing.side ?? "long") === "long") {
    warnings.push({ text: "对本标的做减仓/离场方向", level: "info" });
  }
  if (input.order_type === "market" && input.currentPrice === null) {
    warnings.push({ text: "市价单但当前行情不可用，成交价未知", level: "warn" });
  }
  if (!input.symbol.endsWith("USDT")) {
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
