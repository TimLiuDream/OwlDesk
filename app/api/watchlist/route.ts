import { NextRequest, NextResponse } from "next/server";
import { read, update, uid, ensureSeed } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeed();
  const items = await read((store) => store.watchlist);
  return NextResponse.json({ watchlist: items });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { symbol?: string; name?: string };
  const symbol = (body.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) {
    return NextResponse.json({ error: { code: "BAD_SYMBOL", message: "symbol must be alphanumeric (e.g. TSLAUSDT)" } }, { status: 400 });
  }
  const item = await update((store) => {
    if (store.watchlist.some((w) => w.symbol === symbol)) return null;
    const w = { id: uid("w"), symbol, name: body.name || symbol.replace(/USDT$/, ""), created_at: new Date().toISOString() };
    store.watchlist.push(w);
    return w;
  });
  if (!item) {
    return NextResponse.json({ error: { code: "EXISTS", message: "already in watchlist" } }, { status: 409 });
  }
  return NextResponse.json({ item }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase();
  const removed = await update((store) => {
    const before = store.watchlist.length;
    store.watchlist = store.watchlist.filter((w) => w.symbol !== symbol);
    return before - store.watchlist.length;
  });
  return NextResponse.json({ removed });
}
