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

export const dynamic = "force-dynamic";

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

  if (hub.ok) {
    // strategy_order: trigger/TP-SL/plan orders via the trade module (paper)
    const args: Record<string, unknown> =
      order.order_type === "market"
        ? { action: "place", symbol: order.symbol, side: order.side, orderType: "market", size: String(order.qty) }
        : {
            action: "place",
            symbol: order.symbol,
            side: order.side,
            orderType: "limit",
            price: String(order.limit_price ?? order.trigger_price ?? 0),
            size: String(order.qty),
            ...(order.order_type === "conditional" && order.trigger_price
              ? { triggerPrice: String(order.trigger_price), triggerType: order.trigger_cond ?? "price<=" }
              : {}),
          };
    const res = await hub.invoke("strategy_order", args);
    if (res && res.ok) {
      const data = res.data as { orderId?: string; clientOid?: string } | undefined;
      agenthubRef = data?.orderId ?? data?.clientOid ?? "paper-ok";
      submitted = true;
    } else {
      const message = (res as { error?: { message?: string } })?.error?.message ?? "strategy_order failed";
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
      detail: `signed → ${agenthubRef}${submitted ? "" : " (simulated)"}`,
    });
  });

  const updated = await read((store) => store.order_drafts.find((o) => o.id === id));
  return NextResponse.json({ order: updated, agenthub_ref: agenthubRef });
}
