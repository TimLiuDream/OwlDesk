/**
 * OwlDesk data store.
 *
 * Pragmatic deviation from ARCHITECTURE.md §6: instead of SQLite (native module
 * pain on Windows, non-persistent on Vercel anyway), we keep a JSON file store
 * with the same table shapes. Volume is demo-scale (events, briefs, order
 * drafts, chat logs). Swapping back to SQLite later only touches this file.
 *
 * Tables: watchlist, overnight_events, briefs, order_drafts, chat_messages, audit_log
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export interface WatchlistItem {
  id: string;
  symbol: string; // Bitget symbol, e.g. TSLAUSDT
  name: string;
  created_at: string;
}

export interface OvernightEvent {
  id: string;
  symbol: string;
  ts_et: string; // ISO timestamp in America/New_York
  type: "price_move" | "news" | "sentiment" | "earnings";
  title: string;
  detail: string;
  source_url?: string;
  price?: number;
  change_pct?: number;
  created_at: string;
}

export interface BriefTicker {
  symbol: string;
  name: string;
  what: string;
  why: string;
  view: string;
  focus: string;
}

export interface Brief {
  id: string;
  date: string; // YYYY-MM-DD (ET)
  generated_at: string;
  status: "ok" | "partial";
  summary_json: {
    headline: string;
    /** Session overview paragraph (2-3 sentences). Optional: briefs generated
     * before this field existed only have headline. */
    summary?: string;
    tickers: BriefTicker[];
  };
}

export type OrderStatus =
  | "draft"
  | "signed"
  | "submitted"
  | "filled"
  | "canceled"
  | "rejected";

export interface OrderDraft {
  id: string;
  created_at: string;
  raw_text: string;
  symbol: string;
  side: "buy" | "sell";
  order_type: "market" | "limit" | "conditional";
  qty: number;
  limit_price?: number;
  trigger_cond?: "price>=" | "price<=";
  trigger_price?: number;
  tif: string;
  rationale?: string;
  risk_json: {
    positionPct: number;
    deviationPct: number | null;
    conflictWithPositions: boolean;
    warnings: Array<{ text: string; level: "info" | "warn" | "bad" }>;
    blocked: boolean;
  };
  status: OrderStatus;
  signed_at?: string;
  agenthub_ref?: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  citations_json?: string[];
  created_at: string;
}

export interface AuditEntry {
  id: string;
  ts: string;
  action: "sign" | "submit" | "cancel" | "reject";
  entity_id: string;
  actor: string;
  detail: string;
}

interface Store {
  watchlist: WatchlistItem[];
  overnight_events: OvernightEvent[];
  briefs: Brief[];
  order_drafts: OrderDraft[];
  chat_messages: ChatMessage[];
  audit_log: AuditEntry[];
}

const DATA_DIR = process.env.OWLDESK_DATA_DIR || path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

const EMPTY_STORE: Store = {
  watchlist: [],
  overnight_events: [],
  briefs: [],
  order_drafts: [],
  chat_messages: [],
  audit_log: [],
};

let cache: Store | null = null;

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    cache = { ...structuredClone(EMPTY_STORE), ...JSON.parse(raw) };
  } catch {
    cache = structuredClone(EMPTY_STORE);
  }
  return cache as Store;
}

async function persist(store: Store): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
  cache = store;
}

/** Run a mutation under a simple single-process lock (demo scale). */
let writeChain: Promise<unknown> = Promise.resolve();
export function update<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
  const run = writeChain.then(async () => {
    const store = await load();
    const result = await fn(store);
    await persist(store);
    return result;
  });
  // keep the chain alive even if one mutation fails
  writeChain = run.catch(() => undefined);
  return run;
}

export async function read<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
  const store = await load();
  return fn(store);
}

/** Seed the watchlist on first boot (WATCHLIST_SEED env, comma-separated). */
export async function ensureSeed(): Promise<void> {
  await update((store) => {
    if (store.watchlist.length > 0) return;
    const seed = (process.env.WATCHLIST_SEED || "RTSLAUSDT,RNVDAUSDT,RAAPLUSDT,RMSFTUSDT,RMETAUSDT")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    store.watchlist = seed.map((symbol) => ({
      id: uid("w"),
      symbol,
      name: symbol.replace(/USDT$/, ""),
      created_at: new Date().toISOString(),
    }));
  });
}
