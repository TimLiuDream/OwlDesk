import { NextRequest, NextResponse } from "next/server";
import { read } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase() || null;
  const date = req.nextUrl.searchParams.get("date") || null;

  const events = await read((store) =>
    store.overnight_events
      .filter((e) => (symbol ? e.symbol === symbol : true))
      .filter((e) => (date ? e.ts_et.slice(0, 10) === date : true))
      .sort((a, b) => (a.ts_et < b.ts_et ? 1 : -1))
      .slice(0, 200),
  );

  return NextResponse.json({ events });
}
