/**
 * Chat endpoint — SSE stream of orchestrator events (ARCHITECTURE.md §4.1).
 * Events: tool / delta / citations / error / done
 */

import { NextRequest } from "next/server";
import { runOrchestrator, persistChatTurn } from "@/lib/llm/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; message?: string };
  const sessionId = (body.sessionId || "s_default").slice(0, 64);
  const message = (body.message ?? "").trim().slice(0, 2000);
  if (!message) {
    return new Response(JSON.stringify({ error: { code: "EMPTY", message: "message required" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode("data: " + JSON.stringify(obj) + "\n\n"));
      };
      try {
        const result = await runOrchestrator(sessionId, message, (ev) => send(ev));
        if (result.citations.length > 0) {
          send({ type: "citations", items: result.citations.slice(0, 8) });
        }
        await persistChatTurn(sessionId, message, result.text, result.citations);
        send({ type: "done" });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "orchestrator failed" });
        send({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
