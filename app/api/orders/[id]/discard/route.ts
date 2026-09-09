/**
 * Discard a DRAFT order (A2 review fix): drafts must leave a real state
 * transition, not just disappear from one client's view.
 */

import { NextRequest, NextResponse } from "next/server";
import { read, update, uid } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const order = await read((store) => store.order_drafts.find((o) => o.id === id) ?? null);
  if (!order) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "order not found" } }, { status: 404 });
  }
  if (order.status !== "draft") {
    return NextResponse.json(
      { error: { code: "BAD_STATE", message: `draft 已处理（${order.status}），不能丢弃` } },
      { status: 409 },
    );
  }

  await update((store) => {
    store.order_drafts = store.order_drafts.map((o) => (o.id === id ? { ...o, status: "canceled" } : o));
    store.audit_log.push({
      id: uid("a"),
      ts: new Date().toISOString(),
      action: "cancel",
      entity_id: id,
      actor: "user",
      detail: "discarded before signing",
    });
  });

  const updated = await read((store) => store.order_drafts.find((o) => o.id === id));
  return NextResponse.json({ order: updated });
}
