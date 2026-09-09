import { NextRequest, NextResponse } from "next/server";
import { read, update, uid } from "@/lib/db";
import { getPaperHub } from "@/lib/agenthub/client";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  const order = await read((store) => store.order_drafts.find((o) => o.id === id) ?? null);
  if (!order) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "order not found" } }, { status: 404 });
  }
  if (order.status !== "submitted") {
    return NextResponse.json({ error: { code: "BAD_STATE", message: `cannot cancel from status ${order.status}` } }, { status: 409 });
  }

  // best-effort cancel on paper instance
  const hub = await getPaperHub();
  if (hub.ok && order.agenthub_ref && !order.agenthub_ref.startsWith("demo-")) {
    await hub.invoke("order", { action: "cancel", symbol: order.symbol, orderId: order.agenthub_ref }).catch(() => undefined);
  }

  const now = new Date().toISOString();
  await update((store) => {
    store.order_drafts = store.order_drafts.map((o) => (o.id === id ? { ...o, status: "canceled" } : o));
    store.audit_log.push({
      id: uid("a"),
      ts: now,
      action: "cancel",
      entity_id: id,
      actor: "user",
      detail: `canceled ${order.agenthub_ref ?? ""}`.trim(),
    });
  });

  const updated = await read((store) => store.order_drafts.find((o) => o.id === id));
  return NextResponse.json({ order: updated });
}
