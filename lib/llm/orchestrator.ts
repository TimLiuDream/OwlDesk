/**
 * Chat orchestrator (ARCHITECTURE.md §4.1).
 * Tool-calling loop (max 6 rounds) over the read-only tool registry.
 * Emits progress events for SSE; returns final text + citations.
 */

import { chatCompletion, type ChatMessageParam, type ToolSchema, LlmUnavailableError } from "./provider";
import { CHAT_SYSTEM_PROMPT } from "./prompts";
import { chatTools, type ToolDef } from "@/lib/agenthub/tools";
import { appTools, type DraftOrderAction } from "./app-tools";
import { read, uid, type ChatMessage } from "@/lib/db";

export interface OrchestratorEvent {
  type: "tool" | "delta" | "citations" | "action" | "error" | "done";
  name?: string;
  ok?: boolean;
  ms?: number;
  text?: string;
  items?: string[];
  action?: DraftOrderAction;
  message?: string;
}

export interface OrchestratorResult {
  text: string;
  citations: string[];
  toolEvents: Array<{ name: string; ok: boolean; ms: number }>;
  actions: DraftOrderAction[];
}

const MAX_ROUNDS = 6;

function toSchema(t: ToolDef): ToolSchema {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as unknown as Record<string, unknown>,
    },
  };
}

export async function runOrchestrator(
  sessionId: string,
  userMessage: string,
  emit: (ev: OrchestratorEvent) => void,
): Promise<OrchestratorResult> {
  // conversation history (last 12 turns) + fresh context
  const history = await read((store) =>
    store.chat_messages
      .filter((m) => m.session_id === sessionId)
      .slice(-12)
      .map<ChatMessageParam>((m) => ({ role: m.role, content: m.content })),
  );

  const messages: ChatMessageParam[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];

  const tools = [...chatTools(), ...appTools((a) => actions.push(a))];
  const schemas = tools.map(toSchema);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const citations = new Set<string>();
  const toolEvents: Array<{ name: string; ok: boolean; ms: number }> = [];
  const actions: DraftOrderAction[] = [];

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await chatCompletion(messages, { tools: schemas });
      const choice = res.choices?.[0];
      if (!choice) break;

      const toolCalls = choice.message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const text = choice.message.content ?? "";
        emit({ type: "delta", text });
        return { text, citations: [...citations], toolEvents, actions };
      }

      messages.push({ role: "assistant", content: null, tool_calls: toolCalls });

      for (const call of toolCalls) {
        const tool = byName.get(call.function.name);
        const started = Date.now();
        let result: unknown;
        let ok = true;
        if (!tool) {
          result = { error: "unknown tool" };
          ok = false;
        } else {
          try {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
            } catch {
              args = {};
            }
            result = await tool.run(args);
          } catch (e) {
            result = { error: e instanceof Error ? e.message : "tool failed" };
            ok = false;
          }
        }
        const ms = Date.now() - started;
        toolEvents.push({ name: call.function.name, ok, ms });
        emit({ type: "tool", name: call.function.name, ok, ms });

        // collect citations from signal results
        if (result && typeof result === "object") {
          const r = result as { sources?: string[]; skill?: string; asOf?: string };
          if (Array.isArray(r.sources)) r.sources.forEach((s) => citations.add(s));
          if (r.skill && r.asOf) {
            citations.add(`${r.skill} @ ${new Date(r.asOf).toISOString().slice(11, 16)}Z`);
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result).slice(0, 6000),
        });
      }
    }

    // rounds exhausted — force a final answer without tools
    const res = await chatCompletion(messages, {});
    const text = res.choices?.[0]?.message?.content ?? "";
    emit({ type: "delta", text });
    return { text, citations: [...citations], toolEvents, actions };
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      const message = e.message;
      emit({ type: "error", message });
      return {
        text: "（LLM 未配置或不可用：已降级。请设置 LLM_API_KEY 后重试；行情与信号工具本身仍可用。）",
        citations: [],
        toolEvents,
        actions,
      };
    }
    throw e;
  }
}

export async function persistChatTurn(sessionId: string, user: string, assistant: string, citations: string[]): Promise<void> {
  const { update } = await import("@/lib/db");
  await update((store) => {
    store.chat_messages.push(
      { id: uid("m"), session_id: sessionId, role: "user", content: user, created_at: new Date().toISOString() },
      { id: uid("m"), session_id: sessionId, role: "assistant", content: assistant, citations_json: citations, created_at: new Date().toISOString() } as ChatMessage,
    );
  });
}
