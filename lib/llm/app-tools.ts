/**
 * App-level chat tools (PRD H1): draft orders and list orders from chat.
 * Safety invariant preserved: draft_order_plan only CREATES a draft — it has
 * no submission capability whatsoever; signing stays in the orders UI.
 */

import type { ToolDef } from "@/lib/agenthub/tools";
import { parseOrderPlan } from "./draft-order";
import { riskCheck } from "@/lib/risk/check";
import { getSnapshots } from "@/lib/agenthub/market";
import { getAccountContext } from "@/lib/account";
import { read, update, uid, type OrderDraft } from "@/lib/db";

export interface DraftOrderAction {
  kind: "draft_order";
  draftId: string;
  symbol: string;
  side: string;
  orderType: string;
  qty: number;
}

export async function createOrderDraft(rawText: string): Promise<{ order: OrderDraft } | { error: string }> {
  const plan = await parseOrderPlan(rawText);
  if (!plan.symbol) {
    return { error: "无法识别标的代码，请明确写出（如 TSLA 或 RTSLAUSDT）" };
  }

  const [snap] = await getSnapshots([plan.symbol]);
  const account = await getAccountContext();
  const risk = riskCheck({
    side: plan.side,
    symbol: plan.symbol,
    qty: plan.qty,
    order_type: plan.order_type,
    limit_price: plan.limit_price,
    trigger_price: plan.trigger_price,
    positions: account.positions,
    equityUsdt: account.equityUsdt,
    currentPrice: snap?.price ?? null,
    marketDataLive: snap?.source === "agenthub",
  });

  const draft: OrderDraft = {
    id: uid("d"),
    created_at: new Date().toISOString(),
    raw_text: rawText,
    symbol: plan.symbol,
    side: plan.side,
    order_type: plan.order_type,
    qty: plan.qty ?? 0,
    limit_price: plan.limit_price ?? undefined,
    trigger_cond: plan.trigger_cond ?? undefined,
    trigger_price: plan.trigger_price ?? undefined,
    tif: plan.tif,
    rationale: plan.rationale,
    risk_json: risk,
    status: "draft",
  };

  await update((store) => {
    store.order_drafts.push(draft);
  });
  return { order: draft };
}

export function appTools(collectAction: (a: DraftOrderAction) => void): ToolDef[] {
  return [
    {
      name: "draft_order_plan",
      description:
        "把用户的自然语言下单意图起草为订单计划草稿（不执行、不下单）。草稿生成后需用户在拟单台页面查看风险标注并亲自签字才会提交。当用户表达买入/卖出/止损/回踩接仓等意图时调用。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "用户的原始下单意图描述" },
        },
        required: ["text"],
      },
      run: async (args) => {
        const text = String(args.text ?? "").slice(0, 500);
        const result = await createOrderDraft(text);
        if ("error" in result) return { error: result.error };
        const o = result.order;
        collectAction({
          kind: "draft_order",
          draftId: o.id,
          symbol: o.symbol,
          side: o.side,
          orderType: o.order_type,
          qty: o.qty,
        });
        return {
          draftId: o.id,
          symbol: o.symbol,
          side: o.side,
          orderType: o.order_type,
          qty: o.qty,
          price: o.limit_price ?? o.trigger_price ?? "market",
          risk: o.risk_json.warnings.map((w) => w.text),
          note: "已生成草稿，等待用户在拟单台签字（本工具无任何执行权限）",
        };
      },
    },
    {
      name: "list_orders",
      description: "查询订单列表（草稿/已提交/已成交/已撤销），用于回答「我的挂单」「有没有未签字的草稿」等问题。",
      parameters: { type: "object", properties: {} },
      run: async () => {
        const orders = await read((store) =>
          [...store.order_drafts]
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
            .slice(0, 10)
            .map((o) => ({
              symbol: o.symbol,
              side: o.side,
              type: o.order_type,
              qty: o.qty,
              price: o.limit_price ?? o.trigger_price ?? "market",
              status: o.status,
            })),
        );
        return { orders, note: "仅最近 10 条" };
      },
    },
  ];
}
