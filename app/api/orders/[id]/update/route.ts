/**
 * Amend a DRAFT order: fill in the missing quantity and re-run the risk
 * check (review A4 made qty a hard blocker — this gives users a way to
 * complete the draft without discarding it).
 */

import { NextRequest, NextResponse } from "next/server";
import { read, update, uid } from "@/lib/db";
import { riskCheck } from "@/lib/risk/check";
import { getSnapshots } from "@/lib/agenthub/market";
import { getAccountContext } from "@/lib/account";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = (await req.json().catch(() => ({}))) as { qty?: number | string };
  const qty = Number(body.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: { code: "BAD_QTY", message: "数量必须是正数" } }, { status: 400 });
  }

  const order = await read((store) => store.order_drafts.find((o) => o.id === id) ?? null);
  if (!order) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "order not found" } }, { status: 404 });
  }
  if (order.status !== "draft") {
    return NextResponse.json({ error: { code: "BAD_STATE", message: `只能修改草稿（当前 ${order.status}）` } }, { status: 409 });
  }

  const [snap] = await getSnapshots([order.symbol]);
  const account = await getAccountContext();
  const risk = riskCheck({
    side: order.side,
    symbol: order.symbol,
    qty,
    order_type: order.order_type,
    limit_price: order.limit_price ?? null,
    trigger_price: order.trigger_price ?? null,
    positions: account.positions,
    equityUsdt: account.equityUsdt,
    currentPrice: snap?.price ?? null,
    marketDataLive: snap?.source === "agenthub",
  });

  await update((store) => {
    store.order_drafts = store.order_drafts.map((o) => (o.id === id ? { ...o, qty, risk_json: risk } : o));
    store.audit_log.push({
      id: uid("a"),
      ts: new Date().toISOString(),
      action: "amend",
      entity_id: id,
      actor: "user",
      detail: `qty → ${qty}（补全数量并重检风险）`,
    });
  });

  const updated = await read((store) => store.order_drafts.find((o) => o.id === id));
  return NextResponse.json({ order: updated });
}
