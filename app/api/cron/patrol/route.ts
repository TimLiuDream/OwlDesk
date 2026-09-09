/**
 * Cron patrol endpoint (ARCHITECTURE.md §7, vercel.json).
 * Vercel Cron calls GET with Authorization: Bearer $CRON_SECRET (when set).
 * Also accepts POST { force: true } for manual/demo triggering.
 */

import { NextRequest, NextResponse } from "next/server";
import { runPatrol } from "@/lib/jobs/patrol";
import { ensureSeed } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured (dev/demo)
  const header = req.headers.get("authorization") || "";
  return header === "Bearer " + secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  await ensureSeed();
  const report = await runPatrol(false);
  return NextResponse.json({ report });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  await ensureSeed();
  const report = await runPatrol(body.force === true);
  return NextResponse.json({ report });
}
