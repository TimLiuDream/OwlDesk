"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { OrderDraft } from "@/lib/db";
import OrderPlanCard from "@/components/OrderPlanCard";

export default function OrdersPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-slate-500">加载中…</p>}>
      <OrdersInner />
    </Suspense>
  );
}

function OrdersInner() {
  const [orders, setOrders] = useState<OrderDraft[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const searchParams = useSearchParams();

  const load = useCallback(() => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((d: { orders: OrderDraft[] }) => setOrders(d.orders ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // status polling (PRD C5)
    return () => clearInterval(t);
  }, [load]);

  const draft = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as { order?: OrderDraft; error?: { message?: string } };
      if (!res.ok) {
        alert("起草失败：" + (data.error?.message ?? "请换种说法，明确标的与数量"));
      }
    } finally {
      setBusy(false);
      load();
    }
  };

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setInput(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const replaceOrder = (o: OrderDraft) =>
    setOrders((prev) => prev.map((p) => (p.id === o.id ? o : p)));

  const active = orders.filter((o) => o.status === "draft" || o.status === "submitted");
  const history = orders.filter((o) => o.status !== "draft" && o.status !== "submitted");

  return (
    <div>
      <h1 className="mb-1.5 text-sm font-semibold tracking-wide text-slate-400">
        ✍️ 自然语言起草订单计划 —— AI 拟单，你签字，无签字不下单
      </h1>

      <div className="mb-5 flex gap-2.5">
        <input
          className="input"
          placeholder="例：TSLA 跌破 220 帮我接半仓　/　NVDA 市价买 10 股"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && draft()}
        />
        <button className="btn btn-primary shrink-0" onClick={() => draft()} disabled={busy}>
          {busy ? "起草中…" : "生成订单计划"}
        </button>
      </div>

      <div className="space-y-4">
        {active.length === 0 && (
          <div className="rounded-xl border border-dashed border-line-strong py-8 text-center text-sm text-slate-500">
            还没有订单计划。输入一句话，或从晨报里点「就此拟单」。
          </div>
        )}
        {active.map((o) => (
          <OrderPlanCard key={o.id} order={o} onSigned={replaceOrder} onCanceled={replaceOrder} />
        ))}
      </div>

      {history.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold tracking-wide text-slate-400">📋 历史订单（模拟盘）</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-night-900 text-left text-xs text-slate-400">
                  <th className="px-4 py-3 font-semibold">标的</th>
                  <th className="px-4 py-3 font-semibold">方向</th>
                  <th className="px-4 py-3 font-semibold">类型</th>
                  <th className="px-4 py-3 font-semibold">数量</th>
                  <th className="px-4 py-3 font-semibold">价格/触发</th>
                  <th className="px-4 py-3 font-semibold">状态</th>
                  <th className="px-4 py-3 font-semibold">引用</th>
                </tr>
              </thead>
              <tbody>
                {history.map((o) => (
                  <tr key={o.id} className="border-t border-line">
                    <td className="px-4 py-3 font-semibold">{o.symbol}</td>
                    <td className="px-4 py-3">{o.side === "buy" ? "买入" : "卖出"}</td>
                    <td className="px-4 py-3">{o.order_type}</td>
                    <td className="px-4 py-3 font-mono">{o.qty}</td>
                    <td className="px-4 py-3 font-mono">{o.limit_price ?? o.trigger_price ?? "市价"}</td>
                    <td className="px-4 py-3">
                      <span className={o.status === "canceled" || o.status === "rejected" ? "pill pill-bad" : "pill pill-ok"}>
                        {o.status === "canceled" ? "已撤销" : o.status === "rejected" ? "已拒绝" : o.status === "filled" ? "已成交" : o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{o.agenthub_ref ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-6 text-center text-xs text-slate-600">
        执行经 Bitget Agent Hub trade 模块（--paper-trading，Demo Key）· 签字与撤单全量审计留痕
      </p>
    </div>
  );
}
