/**
 * bitget-signal public MCP client (ARCHITECTURE.md §5.3).
 *
 * The five signal skills (macro-analyst / market-intel / sentiment-analyst /
 * technical-analysis / news-briefing) are backed by Bitget's public
 * market-data MCP over Streamable HTTP — no account, no API key.
 *
 * We speak JSON-RPC 2.0 directly: initialize → tools/list → tools/call.
 * Tool names on the server are discovered at runtime (tools/list) and cached;
 * the five OwlDesk skill aliases fuzzy-match against whatever names exist.
 */

import { safeFetch } from "@/lib/safe-fetch";

export type SignalSkill =
  | "macro"
  | "market-intel"
  | "sentiment"
  | "technical"
  | "news";

export interface SignalResult {
  headline: string;
  keyPoints: string[];
  sources: string[];
  asOf: string;
  skill: SignalSkill;
  source: "mcp" | "demo";
}

const PROTOCOL_VERSION = "2025-03-26";
const CLIENT_INFO = { name: "owldesk", version: "0.1.0" };

function endpoint(): string {
  return process.env.SIGNAL_MCP_URL || "https://datahub.noxiaohao.com/mcp";
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string };
}

/** Parse an MCP Streamable-HTTP response body: plain JSON or SSE-framed data lines. */
async function parseBody(res: Response): Promise<JsonRpcResponse | null> {
  const text = await res.text();
  if (!text) return null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          return JSON.parse(payload) as JsonRpcResponse;
        } catch {
          // skip non-JSON keepalives
        }
      }
    }
    return null;
  }
  try {
    return JSON.parse(text) as JsonRpcResponse;
  } catch {
    return null;
  }
}

let sessionId: string | null = null;
let cachedTools: string[] | null = null;
let rpcId = 0;

async function rpc(method: string, params?: unknown): Promise<JsonRpcResponse | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const res = await safeFetch(endpoint(), {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });

  const newSession = res.headers.get("mcp-session-id");
  if (newSession) sessionId = newSession;

  if (!res.ok) {
    throw new Error(`signal MCP ${method} HTTP ${res.status}`);
  }
  return parseBody(res);
}

async function ensureSession(): Promise<void> {
  if (sessionId) return;
  const init = await rpc("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT_INFO,
  });
  if (init?.error) {
    throw new Error(`signal MCP initialize failed: ${init.error.message}`);
  }
  // fire-and-forget initialized notification
  await safeFetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  }).catch(() => undefined);
}

export async function listSignalTools(): Promise<string[]> {
  if (cachedTools) return cachedTools;
  await ensureSession();
  const res = await rpc("tools/list", {});
  const tools = (res?.result as { tools?: Array<{ name?: string }> } | undefined)?.tools;
  cachedTools = (tools ?? []).map((t) => t.name ?? "").filter(Boolean);
  return cachedTools;
}

/**
 * Skill → (tool, default args) mapping, verified against the live
 * market-data-mcp v1.26.0 tool catalog (2026-09-08):
 *  sentiment → sentiment_index {action:"current"}
 *  news      → news_feed {action:"latest", limit} (no key required)
 *  technical → technical_analysis {action:"full_analysis", symbol:"XXX/USDT"}
 *  macro     → macro_indicators {action:"fomc_news"} (+latest_release fallback)
 *  market-intel → derivatives_sentiment / defi_analytics {action:"tvl_rank"}
 * Tool args are computed per call (symbol-dependent); absent tools fall back
 * to alias matching against the live tools/list.
 */

interface SkillCall {
  tool: string;
  args: (symbol?: string) => Record<string, unknown>;
}

const SKILL_CALLS: Record<SignalSkill, SkillCall> = {
  sentiment: { tool: "sentiment_index", args: () => ({ action: "current" }) },
  news: {
    tool: "news_feed",
    args: (symbol) => (symbol ? { action: "latest", keyword: symbol.replace(/USDT$/, "").replace(/^R/, ""), limit: 5 } : { action: "latest", limit: 5 }),
  },
  technical: {
    tool: "technical_analysis",
    args: (symbol) => ({ action: "full_analysis", symbol: toPair(symbol), timeframe: "1d" }),
  },
  macro: { tool: "macro_indicators", args: () => ({ action: "fomc_news" }) },
  "market-intel": { tool: "derivatives_sentiment", args: () => ({ action: "current" }) },
};

/** RTSLAUSDT → TSLA/USDT (technical_analysis pair format). */
function toPair(symbol?: string): string | undefined {
  if (!symbol) return undefined;
  const base = symbol.replace(/USDT$/, "").replace(/^R/, "");
  return base + "/USDT";
}

const ALIAS_KEYWORDS: Record<SignalSkill, string[]> = {
  macro: ["macro", "fed", "fomc", "rates"],
  "market-intel": ["market-intel", "market_intel", "onchain", "on-chain", "whale", "etf", "defi", "derivatives"],
  sentiment: ["sentiment", "fear", "greed"],
  technical: ["technical", "indicator", "rsi"],
  news: ["news", "briefing", "feed"],
};

function matchTool(skill: SignalSkill, names: string[]): string | null {
  for (const kw of ALIAS_KEYWORDS[skill]) {
    const hit = names.find((n) => n.toLowerCase().includes(kw));
    if (hit) return hit;
  }
  return null;
}

function extractText(content: unknown): { text: string; sources: string[] } {
  // MCP tool result content: array of {type:"text", text} blocks
  const blocks = Array.isArray(content)
    ? (content as Array<{ type?: string; text?: string }>)
    : [];
  const text = blocks
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string)
    .join("\n")
    .trim();
  // pull http(s) URLs out as sources
  const sources: string[] = [];
  if (text) {
    const seen = new Set<string>();
    const matches = text.match(/https:\/\/[^\s)"'>，。]+/g) ?? [];
    for (const raw of matches) {
      const url = raw.replace(/[.,;:]$/, "");
      if (!seen.has(url)) {
        seen.add(url);
        sources.push(url);
      }
    }
  }
  return { text, sources };
}

function demoResult(skill: SignalSkill, symbol?: string): SignalResult {
  const demo: Record<SignalSkill, { h: string; k: string[] }> = {
    macro: {
      h: "宏观面：财报季前观望情绪主导",
      k: ["美元指数窄幅震荡", "十年期美债利率持平", "风险偏好中性"],
    },
    "market-intel": {
      h: "资金面：ETF 净流入温和",
      k: ["主流 ETF 净流入为正", "无异常巨鲸转移", "DeFi TVL 稳定"],
    },
    sentiment: {
      h: "情绪面：恐惧/贪婪指数中性偏谨慎",
      k: ["指数 54（昨日 52）", "资金费率正常区间", "多空比均衡"],
    },
    technical: {
      h: `技术面：${symbol ?? "标的"} 处于区间震荡`,
      k: ["RSI 中性", "MACD 零轴附近", "关注前高压力与前低支撑"],
    },
    news: {
      h: `新闻面：${symbol ?? "市场"} 无重大突发`,
      k: ["财报季临近，公司消息以预期管理为主", "宏观日程平静"],
    },
  };
  const d = demo[skill];
  return {
    headline: d.h,
    keyPoints: d.k,
    sources: [],
    asOf: new Date().toISOString(),
    skill,
    source: "demo",
  };
}

export async function callSignal(
  skill: SignalSkill,
  args: { symbol?: string } = {},
): Promise<SignalResult> {
  try {
    const names = await listSignalTools();
    const known = SKILL_CALLS[skill];
    const tool = names.includes(known.tool) ? known.tool : matchTool(skill, names);
    if (!tool) return demoResult(skill, args.symbol);

    const callArgs = names.includes(known.tool)
      ? known.args(args.symbol)
      : args.symbol
        ? { symbol: toPair(args.symbol) ?? args.symbol }
        : {};

    const res = await rpc("tools/call", { name: tool, arguments: callArgs });
    if (res?.error) return demoResult(skill, args.symbol);

    const content = (res?.result as { content?: unknown } | undefined)?.content;
    const { text, sources } = extractText(content);
    if (!text || text.startsWith('{"error"')) return demoResult(skill, args.symbol);

    // Shape raw text → headline + keyPoints. JSON payloads get flattened.
    return shapeResult(text, sources, skill);
  } catch {
    // Network/protocol failure must never break patrol or brief generation.
    return demoResult(skill, args.symbol);
  }
}

function shapeResult(text: string, sources: string[], skill: SignalSkill): SignalResult {
  const trimmed = text.trim();

  // news_feed returns [{feed, error, items:[{title, link...}]}]. Once we
  // recognize this shape, it OWNS the outcome: real headlines → result,
  // all-empty items (upstream RSS failure) → NoRealContent → demo fallback.
  // Never let this payload fall through to generic JSON flattening — that
  // turns failure metadata ("feed: cointelegraph") into fake news events.
  if (looksLikeNewsFeed(trimmed)) {
    const shaped = shapeNewsFeed(trimmed);
    if (shaped) {
      return { ...shaped, sources: dedupe([...shaped.sources, ...sources]), asOf: new Date().toISOString(), skill, source: "mcp" };
    }
    throw new NoRealContent();
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const flat: string[] = [];
      const walk = (node: unknown, depth: number) => {
        if (flat.length >= 8 || depth > 3) return;
        if (Array.isArray(node)) {
          for (const item of node.slice(0, 6)) walk(item, depth + 1);
        } else if (node && typeof node === "object") {
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
              flat.push(`${k}: ${String(v).slice(0, 90)}`);
            } else {
              walk(v, depth + 1);
            }
          }
        } else if (node != null) {
          flat.push(String(node).slice(0, 90));
        }
      };
      walk(parsed, 0);
      // drop error-keyed noise; if nothing real remains, treat as no data
      const real = flat.filter((f) => !/^(alt_me_error|error|feed)[:\s]/i.test(f) && f.split(": ").pop() !== "");
      if (real.length > 0) {
        return {
          headline: real[0],
          keyPoints: real.slice(1, 8),
          sources,
          asOf: new Date().toISOString(),
          skill,
          source: "mcp",
        };
      }
      throw new NoRealContent();
    } catch (e) {
      if (e instanceof NoRealContent) throw e;
      // fall through to line-based shaping
    }
  }
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new NoRealContent();
  return {
    headline: lines[0]?.slice(0, 200) ?? "",
    keyPoints: lines.slice(1, 8).map((l) => l.replace(/^[-*•]\s*/, "")),
    sources,
    asOf: new Date().toISOString(),
    skill,
    source: "mcp",
  };
}

class NoRealContent extends Error {}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

/** Detect the news_feed payload shape: an array whose entries carry feed/items keys. */
function looksLikeNewsFeed(trimmed: string): boolean {
  if (!trimmed.startsWith("[")) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    const entries = parsed as Array<Record<string, unknown>>;
    return entries.some((e) => "feed" in e && "items" in e);
  } catch {
    return false;
  }
}

/** Parse news_feed-shaped payloads; returns null if not that shape or no items. */
function shapeNewsFeed(trimmed: string): { headline: string; keyPoints: string[]; sources: string[] } | null {
  if (!trimmed.startsWith("[")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const headlines: string[] = [];
  const urls: string[] = [];
  for (const block of parsed as Array<Record<string, unknown>>) {
    const items = block?.items;
    if (!Array.isArray(items)) continue;
    for (const item of items.slice(0, 5) as Array<Record<string, unknown>>) {
      if (typeof item?.title === "string" && item.title) headlines.push(item.title.slice(0, 120));
      const link = item?.link ?? item?.url;
      if (typeof link === "string" && link.startsWith("http")) urls.push(link);
    }
  }
  if (headlines.length === 0) return null;
  return { headline: `聚合新闻 ${headlines.length} 条（Top：${headlines[0]}）`, keyPoints: headlines.slice(1, 8), sources: urls };
}
