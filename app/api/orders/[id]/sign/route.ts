/**
 * Sign endpoint — the ONLY write path in OwlDesk (ARCHITECTURE.md §4.2/§8).
 *
 * Preconditions enforced here:
 *  - order status must be "draft"
 *  - risk.blocked must be false
 *  - execution goes through the paper-trading Agent Hub instance only
 *  - every attempt lands in audit_log
 */

import { NextRequest, NextResponse } from "next/server";
import { read, update, uid } from "@/lib/db";
import { getPaperHub } from "@/lib/agenthub/client";
import { getSnapshots } from "@/lib/agenthub/market";

export const dynamic = "force-dynamic";

/**
 * Build v3 place-order args for the SPOT rToken.
 * Verified contract (discover order/place):
 *  - required: category, symbol, qty, side, orderType
 *  - SPOT market BUY qty unit = quote coin (USDT notional);
 *    limit & market SELL qty unit = base coin (shares)
 *  - spot has no native trigger orders via Agent Hub → conditional maps
 *    to a resting limit when it doesn't cross the market; crossing stops
 *    (sell below market) are rejected to avoid instant execution.
 */
function buildPlaceArgs(
  order: {
    symbol: string;
    side: "buy" | "sell";
    order_type: "market" | "limit" | "conditional";
    qty: number;
    limit_price?: number;
    trigger_price?: number;
    tif: string;
  },
  currentPrice: number | null,
  marketDataLive: boolean,
): { args: Record<string, unknown>; note: string } | { error: string } {
  const base = { category: "SPOT", symbol: order.symbol, side: order.side };

  if (order.qty <= 0) {
    return { error: "数量缺失或非法，拒绝提交（请在草稿中补全数量）" };
  }

  if (order.order_type === "market") {
    if (order.side === "buy") {
      if (!currentPrice) return { error: "市价买单需要当前行情换算 USDT 金额，行情不可用" };
      if (!marketDataLive) return { error: "实时行情不可用（仅演示数据），市价买入金额无法可靠换算，拒绝提交" };
      const notional = Math.round(order.qty * currentPrice * 100) / 100;
      return {
        args: { ...base, action: "place", orderType: "market", qty: String(notional) },
        note: `SPOT 市价买入按计价币下单：${order.qty} 股 ≈ ${notional} USDT`,
      };
    }
    return {
      args: { ...base, action: "place", orderType: "market", qty: String(order.qty) },
      note: `SPOT 市价卖出按基础币下单：${order.qty} 股`,
    };
  }

  const price = order.order_type === "limit" ? order.limit_price : order.trigger_price;
  if (!price) return { error: "订单缺少限价/触发价" };

  if (order.order_type === "conditional" && marketDataLive && currentPrice !== null) {
    const crossing =
      (order.side === "sell" && price < currentPrice) || (order.side === "buy" && price > currentPrice);
    if (crossing) {
      return {
        error: `条件单方向会跨越市价（${order.side === "sell" ? "卖出价低于" : "买入价高于"}现价 ${currentPrice}），映射为限价单会立即成交。现货条件单需本地监控执行，本版已拒绝提交`,
      };
    }
  }

  return {
    args: {
      ...base,
      action: "place",
      orderType: "limit",
      qty: String(order.qty),
      price: String(price),
      timeInForce: "gtc",
    },
    note:
      order.order_type === "conditional"
        ? `现货无原生条件单，已映射为限价挂单 @${price}（GTC）`
        : `限价单 @${price}（GTC）`,
  };
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  const order = await read((store) => store.order_drafts.find((o) => o.id === id) ?? null);
  if (!order) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "order draft not found" } }, { status: 404 });
  }
  if (order.status !== "draft") {
    return NextResponse.json({ error: { code: "BAD_STATE", message: `order already ${order.status}` } }, { status: 409 });
  }
  if (order.risk_json.blocked) {
    await update((store) => {
      store.audit_log.push({
        id: uid("a"),
        ts: new Date().toISOString(),
        action: "reject",
        entity_id: id,
        actor: "user",
        detail: "blocked by risk check",
      });
    });
    return NextResponse.json({ error: { code: "RISK_BLOCKED", message: "风险检查未通过，禁止提交" } }, { status: 422 });
  }

  const hub = await getPaperHub();
  let agenthubRef = "paper-sdk-unavailable";
  let submitted = false;
  let submitNote = "no demo key — simulated submit";

  if (hub.ok) {
    const [snap] = await getSnapshots([order.symbol]);
    // 市价买需要用实时价换算计价币金额——演示/降级价格不可用于换算
    const built = buildPlaceArgs(order, snap?.price ?? null, snap?.source === "agenthub");
    if ("error" in built) {
      await update((store) => {
        store.audit_log.push({
          id: uid("a"),
          ts: new Date().toISOString(),
          action: "reject",
          entity_id: id,
          actor: "system",
          detail: built.error,
        });
      });
      return NextResponse.json({ error: { code: "BAD_ORDER", message: built.error } }, { status: 422 });
    }

    const res = await hub.invoke("order", built.args);
    if (res && res.ok) {
      const data = res.data as { orderId?: string; clientOid?: string } | undefined;
      agenthubRef = data?.orderId ?? data?.clientOid ?? "paper-ok";
      submitted = true;
      submitNote = built.note;
    } else {
      const message = (res as { error?: { message?: string } })?.error?.message ?? "place order failed";
      if (/does not exist/i.test(message)) {
        // Paper environment doesn't list this symbol (rTokens are live-only for
        // now) → hand the order to the desk simulator; patrol watches price and
        // records a clearly-labeled simulated fill.
        submitted = true;
        agenthubRef = "demo-" + uid("sim");
        submitNote = `模拟盘暂未上线该标的，已转由桌台模拟执行（巡检触发成交，审计留痕）`;
      } else {
        await update((store) => {
          store.order_drafts = store.order_drafts.map((o) => (o.id === id ? { ...o, status: "rejected" } : o));
          store.audit_log.push({
            id: uid("a"),
            ts: new Date().toISOString(),
            action: "reject",
            entity_id: id,
            actor: "system",
            detail: message,
          });
        });
        return NextResponse.json({ error: { code: "SUBMIT_FAILED", message } }, { status: 502 });
      }
    }
  } else {
    // demo mode: no demo key — record as submitted-to-simulated desk
    submitted = true;
    agenthubRef = "demo-" + uid("sim");
  }

  const now = new Date().toISOString();
  await update((store) => {
    store.order_drafts = store.order_drafts.map((o) =>
      o.id === id ? { ...o, status: "submitted", signed_at: now, agenthub_ref: agenthubRef } : o,
    );
    store.audit_log.push({
      id: uid("a"),
      ts: now,
      action: "sign",
      entity_id: id,
      actor: "user",
      detail: `signed → ${agenthubRef}（${submitNote}）`,
    });
  });

  const updated = await read((store) => store.order_drafts.find((o) => o.id === id));
  return NextResponse.json({ order: updated, agenthub_ref: agenthubRef, note: submitNote });
}
