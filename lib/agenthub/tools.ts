/**
 * LLM tool registry (ARCHITECTURE.md §5.2).
 *
 * Read-heavy tools mounted into the chat orchestrator. Note what is
 * deliberately ABSENT: any order-placement tool. The orchestrator can only
 * produce drafts; the sole write path is the sign endpoint calling the paper
 * instance directly. This is the core safety property of OwlDesk.
 */

import { getSnapshots } from "./market";
import { callSignal, type SignalSkill } from "./signal";
import { getAccountContext } from "@/lib/account";

export interface ToolDef {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

async function getPositionsDemoSafe(): Promise<unknown> {
  const ctx = await getAccountContext();
  return {
    list: ctx.positions.map((p) => ({ symbol: p.symbol, qty: String(p.qty), side: p.side ?? "long", markPrice: String(p.markPrice) })),
    equityUsdt: ctx.equityUsdt,
    demo: ctx.demo,
  };
}

function signalTool(name: string, skill: SignalSkill, description: string, withSymbol: boolean): ToolDef {
  return {
    name,
    description,
    parameters: withSymbol
      ? {
          type: "object",
          properties: { symbol: { type: "string", description: "标的代码，如 TSLAUSDT" } },
          required: ["symbol"],
        }
      : { type: "object", properties: {} },
    run: async (args) => {
      const r = await callSignal(skill, { symbol: withSymbol ? String(args.symbol ?? "") : undefined });
      return r;
    },
  };
}

export function chatTools(): ToolDef[] {
  return [
    {
      name: "get_market_snapshot",
      description: "获取自选标的的实时行情快照（价格、24h 涨跌幅、高低、成交量）。数据来自 Bitget Agent Hub market 模块。",
      parameters: {
        type: "object",
        properties: {
          symbols: {
            type: "array",
            items: { type: "string" },
            description: "Bitget 标的代码列表，如 [\"TSLAUSDT\",\"NVDAUSDT\"]",
          },
        },
        required: ["symbols"],
      },
      run: async (args) => getSnapshots((args.symbols as string[]) ?? []),
    },
    {
      name: "get_positions",
      description: "只读获取当前账户持仓（模拟盘），用于仓位与风险相关问题。",
      parameters: { type: "object", properties: {} },
      run: async () => getPositionsDemoSafe(),
    },
    signalTool("get_news", "news", "获取加密/代币化美股相关新闻简报。来自 bitget-signal news-briefing 技能。", true),
    signalTool("get_sentiment", "sentiment", "获取市场情绪指标（恐惧贪婪指数、资金费率、多空比）。来自 bitget-signal sentiment-analyst。", false),
    signalTool("get_technical", "technical", "获取标的技术面分析（RSI、MACD、支撑压力位）。来自 bitget-signal technical-analysis。", true),
    signalTool("get_macro", "macro", "获取宏观面分析（美联储政策、收益率、跨资产相关性）。来自 bitget-signal macro-analyst。", false),
  ];
}
