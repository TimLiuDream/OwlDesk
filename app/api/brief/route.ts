import { NextRequest, NextResponse } from "next/server";
import { read, ensureSeed } from "@/lib/db";
import { generateBrief } from "@/lib/jobs/brief";
import { etDate } from "@/lib/jobs/patrol";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeed();
  const date = req.nextUrl.searchParams.get("date") || etDate();
  const includeEvents = req.nextUrl.searchParams.get("events") === "1";

  let brief = await read((store) => store.briefs.find((b) => b.date === date) ?? null);
  if (!brief) {
    // lazily generate on first visit (demo-anytime requirement)
    const res = await generateBrief(false);
    brief = res.brief;
  }

  const events = includeEvents
    ? await read((store) =>
        store.overnight_events
          .filter((e) => e.ts_et.slice(0, 10) === date)
          .sort((a, b) => (a.ts_et < b.ts_et ? 1 : -1)),
      )
    : undefined;

  return NextResponse.json({ brief, events });
}

export async function POST(req: NextRequest) {
  const force = (await req.json().catch(() => ({}))).force === true;
  const { brief, created } = await generateBrief(force);
  return NextResponse.json({ brief, created });
}
