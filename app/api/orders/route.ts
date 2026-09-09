import { NextRequest, NextResponse } from "next/server";
import { read, update, uid, type OrderDraft } from "@/lib/db";
import { parseOrderPlan } from "@/lib/llm/draft-order";
import { riskCheck } from "@/lib/risk/check";
import { getSnapshots } from "@/lib/agenthub/market";
import { getReadonlyHub } from "@/lib/agenthub/client";

export const dynamic = "force-dynamic";

async function demoPositions(): Promise<Array<{ symbol: string; qty: number; markPrice: number; side?: string }>> {
  const hub = await getReadonlyHub();
  if (hub.ok) {
    const res = await hub.invoke("account_overview", { action: "balances" });
    if (res && res.ok) {
      // shape varies; best-effort normalize
      const data = res.data as { list?: Array<Record<string, string>> } | undefined;
      const list = data?.list ?? [];
      return list
        .map((r) => ({
          symbol: String(r.symbol ?? "").toUpperCase(),
          qty: Number(r.available ?? r.qty ?? 0),
          markPrice: Number(r.markPrice ?? r.u ?? 0),
          side: "long",
        }))
        .filter((p) => p.qty > 0);
    }
  }
  return [
    { symbol: "RTSLAUSDT", qty: 25, markPrice: 224.8, side: "long" },
    { symbol: "RNVDAUSDT", qty: 10, markPrice: 172.4, side: "long" },
    { symbol: "RSPYUSDT", qty: 5, markPrice: 5480, side: "long" },
  ];
}

const DEMO_EQUITY_USDT = 25_000;

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const orders = await read((store) =>
    [...store.order_drafts]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .filter((o) => (status ? o.status === status : true))
      .slice(0, 100),
  );
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: { code: "EMPTY", message: "text required" } }, { status: 400 });
  }

  const plan = await parseOrderPlan(text);
  if (!plan.symbol) {
    return NextResponse.json(
      { error: { code: "SYMBOL_UNKNOWN", message: "无法识别标的代码，请明确写出（如 TSLA）" } },
      { status: 422 },
    );
  }

  const [snap] = await getSnapshots([plan.symbol]);
  const positions = await demoPositions();
  const risk = riskCheck({
    side: plan.side,
    symbol: plan.symbol,
    qty: plan.qty,
    order_type: plan.order_type,
    limit_price: plan.limit_price,
    trigger_price: plan.trigger_price,
    positions,
    equityUsdt: DEMO_EQUITY_USDT,
    currentPrice: snap?.price ?? null,
  });

  const draft: OrderDraft = {
    id: uid("d"),
    created_at: new Date().toISOString(),
    raw_text: text,
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

  return NextResponse.json({ order: draft }, { status: 201 });
}
