/**
 * Overnight patrol driver (local dev substitute for Vercel Cron).
 *
 * - every 15 minutes: POST /api/cron/patrol (the endpoint itself gates on the
 *   US session window ET 09:30–16:00; outside it just reports skipped)
 * - at 04:20 and 07:25 Beijing time (after the 04:00 ET-close): regenerate
 *   the brief so it's ready when the user wakes up
 *
 * Plain Node (>=18), no deps. Logs to ./data/overnight.log
 */

const BASE = process.env.OWLDESK_BASE_URL || "http://127.0.0.1:3000";
const LOG_FILE = new URL("../data/overnight.log", import.meta.url);
const BRIEF_TIMES = new Set(["04:20", "07:25"]);

import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const logPath = path.dirname(fileURLToPath(LOG_FILE));
mkdirSync(logPath, { recursive: true });

function log(line) {
  const ts = new Date().toLocaleString("zh-CN", { hour12: false });
  const msg = `[${ts}] ${line}`;
  console.log(msg);
  try {
    appendFileSync(fileURLToPath(LOG_FILE), msg + "\n");
  } catch {
    // logging must never kill the loop
  }
}

async function post(pathname, body) {
  const headers = { "Content-Type": "application/json" };
  // Server deployments require CRON_SECRET (see docs/DEPLOY.md); the patrol
  // endpoint validates Bearer auth when it is set.
  const secret = process.env.CRON_SECRET;
  if (secret) headers["Authorization"] = "Bearer " + secret;
  const res = await fetch(BASE + pathname, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 300) };
}

async function patrol() {
  try {
    const r = await post("/api/cron/patrol");
    log(`patrol ${r.status} ${r.text}`);
  } catch (e) {
    log(`patrol FAILED: ${e.message}`);
  }
}

async function brief() {
  try {
    const r = await post("/api/brief", { force: true });
    log(`brief ${r.status} ${r.text.slice(0, 120)}`);
  } catch (e) {
    log(`brief FAILED: ${e.message}`);
  }
}

const doneBrief = new Set();
let lastPatrolMinute = -1;

log(`overnight driver started, base=${BASE}, brief times=[${[...BRIEF_TIMES].join(", ")}]`);

setInterval(() => {
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5); // "HH:MM" local (Beijing)
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();

  if (minuteOfDay % 15 === 0 && minuteOfDay !== lastPatrolMinute) {
    lastPatrolMinute = minuteOfDay;
    patrol();
  }

  const dayKey = now.toISOString().slice(0, 10);
  if (BRIEF_TIMES.has(hhmm) && !doneBrief.has(dayKey + hhmm)) {
    doneBrief.add(dayKey + hhmm);
    brief();
  }
}, 60_000);

// fire once at startup so a fresh boot records immediately
patrol();
