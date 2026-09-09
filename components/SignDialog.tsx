"use client";

import type { OrderDraft } from "@/lib/db";

export default function SignDialog({
  order,
  onConfirm,
  onClose,
}: {
  order: OrderDraft;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="card w-[92%] max-w-md border-line-strong bg-night-700 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1.5 flex items-center gap-2 text-lg font-bold">
          ✍️ 签字确认 <span className="pill pill-warn">模拟盘 · Demo Key</span>
        </h3>
        <p className="mb-4 text-[13px] leading-relaxed text-slate-400">
          这是下单前的最后一步。AI 不会修改任何参数；签字后通过 Bitget Agent Hub 的
          <code className="mx-1 rounded bg-night-900 px-1.5 py-0.5 text-xs">strategy_order</code>
          提交到 Bitget 模拟盘。此操作将记入审计日志。
        </p>

        <div className="mb-5 space-y-1 rounded-xl border border-line bg-night-950 p-4 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">标的 / 方向</span><b>{order.symbol} · {order.side === "buy" ? "买入" : "卖出"}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">类型 / 数量</span><b>{order.order_type} · {order.qty} 股</b></div>
          <div className="flex justify-between"><span className="text-slate-500">价格/触发</span><b className="font-mono">{order.limit_price ?? order.trigger_price ?? "市价"}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">执行环境</span><b>Bitget 模拟盘（paper trading）</b></div>
        </div>

        <div className="flex justify-end gap-2.5">
          <button className="btn btn-ghost" onClick={onClose}>返回修改</button>
          <button className="btn btn-primary" onClick={onConfirm}>确认签字并提交</button>
        </div>
      </div>
    </div>
  );
}
