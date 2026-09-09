"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

interface Msg {
  role: "user" | "assistant";
  text: string;
  citations?: string[];
  tools?: string[];
}

const CHIPS = [
  "昨晚整体行情怎么样？",
  "TSLAUSDT 技术面怎么看？",
  "现在市场情绪如何？",
  "帮我看看我的持仓风险",
];

function sessionId(): string {
  if (typeof window === "undefined") return "s_default";
  const existing = window.localStorage.getItem("owldesk_session");
  if (existing) return existing;
  const id = "s_" + crypto.randomUUID().slice(0, 8);
  window.localStorage.setItem("owldesk_session", id);
  return id;
}

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-slate-500">加载中…</p>}>
      <ChatInner />
    </Suspense>
  );
}

function ChatInner() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "我是 OwlDesk 值守研究台 🦉\n夜里我巡检自选标的、写晨报；白天你可以问我行情、技术面、情绪和持仓风险，或说「帮我拟个单：…」——我只起草，签字权在你。",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (preset?: string) => {
    const q = (preset ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);

    const assistant: Msg = { role: "assistant", text: "", tools: [] };
    setMessages((m) => [...m, assistant]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId(), message: q }),
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data:")) continue;
          const ev = JSON.parse(part.slice(5).trim()) as {
            type: string;
            text?: string;
            items?: string[];
            name?: string;
            ok?: boolean;
            message?: string;
          };
          if (ev.type === "tool") {
            setMessages((m) => {
              const last = m[m.length - 1];
              last.tools = [...(last.tools ?? []), `${ev.name} ${ev.ok ? "✓" : "✗"}`];
              return [...m];
            });
          } else if (ev.type === "delta" && ev.text) {
            setMessages((m) => {
              const last = m[m.length - 1];
              last.text += ev.text;
              return [...m];
            });
          } else if (ev.type === "citations" && ev.items) {
            setMessages((m) => {
              const last = m[m.length - 1];
              last.citations = ev.items;
              return [...m];
            });
          } else if (ev.type === "error" && ev.message) {
            setMessages((m) => {
              const last = m[m.length - 1];
              last.text += `\n\n⚠️ ${ev.message}`;
              return [...m];
            });
          }
        }
      }
    } catch {
      setMessages((m) => {
        const last = m[m.length - 1];
        last.text += "\n\n⚠️ 连接中断，请重试。";
        return [...m];
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            className="rounded-full border border-line-strong px-3.5 py-1.5 text-xs text-slate-400 transition-colors hover:border-owl-amber hover:text-owl-amber"
            onClick={() => send(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="card flex h-[calc(100vh-260px)] min-h-[420px] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[78%] rounded-2xl rounded-br-sm bg-[#233457] px-4 py-3 text-sm"
                    : "max-w-[78%] rounded-2xl rounded-bl-sm border border-line bg-night-800 px-4 py-3 text-sm"
                }
              >
                {m.role === "assistant" && <div className="mb-1 text-[11px] tracking-wide text-slate-500">🦉 OwlDesk</div>}
                <div className="whitespace-pre-wrap leading-relaxed">{m.text || (busy && i === messages.length - 1 ? "…" : "")}</div>
                {m.tools && m.tools.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.tools.map((t, j) => (
                      <span key={j} className="pill text-[10px]">🔧 {t}</span>
                    ))}
                  </div>
                )}
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2.5 border-t border-dashed border-line pt-2 text-[11px] text-slate-500">
                    📎 {m.citations.slice(0, 4).map((c) => (c.startsWith("http") ? c.replace(/^https?:\/\//, "").slice(0, 40) : c)).join(" · ")}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="pl-1 text-xs text-slate-500">🦉 正在调用 Agent Hub 工具…</div>}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2.5 border-t border-line p-3.5">
          <input
            className="input"
            placeholder="问行情、问晨报，或直接说「帮我拟个单：…」"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button className="btn btn-primary shrink-0" onClick={() => send()} disabled={busy}>
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
