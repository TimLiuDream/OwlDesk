import { NextRequest, NextResponse } from "next/server";
import { read, ensureSeed } from "@/lib/db";
import { generateBrief } from "@/lib/jobs/brief";
import { etDate } from "@/lib/jobs/patrol";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeed();
  const param = req.nextUrl.searchParams.get("date");
  const date = param || etDate();
  const includeEvents = req.nextUrl.searchParams.get("events") === "1";

  let brief = await read((store) => store.briefs.find((b) => b.date === date) ?? null);
  let stale = false;

  if (!brief && !param) {
    // A8: after the ET date flips (e.g. Beijing noon), default to the most
    // recent brief instead of an empty page — judges open the link anytime.
    const latest = await read((store) =>
      [...store.briefs].sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null,
    );
    if (latest) {
      brief = latest;
      stale = latest.date !== date;
    }
  }

  if (!brief) {
    // first boot ever — lazily generate today's
    const res = await generateBrief(false);
    brief = res.brief;
  }

  const briefDate = brief.date;
  const events = includeEvents
    ? await read((store) =>
        store.overnight_events
          .filter((e) => e.ts_et.slice(0, 10) === briefDate)
          .sort((a, b) => (a.ts_et < b.ts_et ? 1 : -1)),
      )
    : undefined;

  return NextResponse.json({ brief, events, stale });
}

export async function POST(req: NextRequest) {
  const force = (await req.json().catch(() => ({}))).force === true;
  const { brief, created } = await generateBrief(force);
  return NextResponse.json({ brief, created });
}
