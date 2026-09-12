import { NextRequest, NextResponse } from "next/server";
import { read, update, uid, type OrderDraft } from "@/lib/db";
import { parseOrderPlan } from "@/lib/llm/draft-order";
import { riskCheck } from "@/lib/risk/check";
import { getSnapshots } from "@/lib/agenthub/market";
import { getAccountContext } from "@/lib/account";

export const dynamic = "force-dynamic";

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
  const body = (await req.json().catch(() => ({}))) as { text?: string; defaultQty?: number | string };
  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: { code: "EMPTY", message: "text required" } }, { status: 400 });
  }
  const defaultQtyRaw = Number(body.defaultQty);
  const defaultQty = Number.isFinite(defaultQtyRaw) && defaultQtyRaw > 0 ? defaultQtyRaw : 10;

  const plan = await parseOrderPlan(text);
  if (!plan.symbol) {
    return NextResponse.json(
      { error: { code: "SYMBOL_UNKNOWN", message: "无法识别标的代码，请明确写出（如 TSLA）" } },
      { status: 422 },
    );
  }

  // 数量缺失时用默认股数生成可签字的计划卡，而不是硬阻断——
  // 默认值在卡片风险标注里明示，且随时可内联修改
  const usedDefault = plan.qty === null;
  const qty = plan.qty ?? defaultQty;

  const [snap] = await getSnapshots([plan.symbol]);
  const account = await getAccountContext();
  const risk = riskCheck({
    side: plan.side,
    symbol: plan.symbol,
    qty,
    order_type: plan.order_type,
    limit_price: plan.limit_price,
    trigger_price: plan.trigger_price,
    positions: account.positions,
    equityUsdt: account.equityUsdt,
    currentPrice: snap?.price ?? null,
    marketDataLive: snap?.source === "agenthub",
  });
  if (usedDefault) {
    risk.warnings = risk.warnings.filter((w) => w.level !== "info");
    risk.warnings.unshift({
      text: `未在指令中指定数量，已使用默认 ${qty} 股（可修改后重新签字）`,
      level: "warn",
    });
  }

  const draft: OrderDraft = {
    id: uid("d"),
    created_at: new Date().toISOString(),
    raw_text: text,
    symbol: plan.symbol,
    side: plan.side,
    order_type: plan.order_type,
    qty,
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
