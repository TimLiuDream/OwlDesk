"use client";

import { useState } from "react";
import type { OrderDraft } from "@/lib/db";
import SignDialog from "./SignDialog";

const TYPE_LABEL: Record<OrderDraft["order_type"], string> = {
  market: "市价单",
  limit: "限价单",
  conditional: "条件单",
};

const STATUS_PILL: Record<OrderDraft["status"], string> = {
  draft: "pill pill-warn",
  signed: "pill pill-ok",
  submitted: "pill pill-ok",
  filled: "pill pill-ok",
  canceled: "pill pill-bad",
  rejected: "pill pill-bad",
};

const STATUS_LABEL: Record<OrderDraft["status"], string> = {
  draft: "待签字",
  signed: "已签字",
  submitted: "已提交模拟盘",
  filled: "已成交",
  canceled: "已撤销",
  rejected: "已拒绝",
};

export default function OrderPlanCard({
  order,
  onSigned,
  onCanceled,
}: {
  order: OrderDraft;
  onSigned: (o: OrderDraft) => void;
  onCanceled: (o: OrderDraft) => void;
}) {
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);

  const priceLabel =
    order.order_type === "market"
      ? "市价"
      : order.order_type === "conditional"
        ? `${order.trigger_cond === "price>=" ? "触发 ≥" : "触发 ≤"} ${order.trigger_price ?? "—"}`
        : `≤ ${order.limit_price ?? "—"}`;

  const sign = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/sign`, { method: "POST" });
      const data = (await res.json()) as { order?: OrderDraft; error?: { message?: string } };
      if (res.ok && data.order) {
        onSigned(data.order);
      } else {
        alert("提交失败：" + (data.error?.message ?? "unknown"));
      }
    } finally {
      setBusy(false);
      setSigning(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/cancel`, { method: "POST" });
      const data = (await res.json()) as { order?: OrderDraft };
      if (res.ok && data.order) onCanceled(data.order);
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/discard`, { method: "POST" });
      const data = (await res.json()) as { order?: OrderDraft };
      if (res.ok && data.order) onCanceled(data.order);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`card overflow-hidden ${order.status !== "draft" ? "border-owl-teal/40" : ""}`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4">
        <span className="text-base font-bold">{order.symbol}</span>
        <span className="pill">{TYPE_LABEL[order.order_type]}</span>
        <span className={STATUS_PILL[order.status]}>{STATUS_LABEL[order.status]}</span>
        <span className="flex-1" />
        <span className="text-xs text-slate-500">{new Date(order.created_at).toLocaleTimeString("zh-CN")}</span>
      </div>

      <div className="grid md:grid-cols-[1fr_300px]">
        <div className="px-6 py-4 md:border-r md:border-line">
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="w-24 py-1.5 text-slate-500">方向</td><td>{order.side === "buy" ? "买入（做多）" : "卖出（做空/减仓）"}</td></tr>
              <tr><td className="py-1.5 text-slate-500">数量</td><td className="font-mono">{order.qty > 0 ? `${order.qty} 股` : "待人工确认"}</td></tr>
              <tr><td className="py-1.5 text-slate-500">价格/触发</td><td className="font-mono">{priceLabel}</td></tr>
              <tr><td className="py-1.5 text-slate-500">有效期</td><td>{order.tif}</td></tr>
              {order.agenthub_ref && (
                <tr><td className="py-1.5 text-slate-500">订单引用</td><td className="font-mono text-xs">{order.agenthub_ref}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-owl-amber/[0.03] px-6 py-4">
          <div className="mb-2 text-xs font-semibold tracking-widest text-owl-amber">⚠ 风险标注（AI 自动检查）</div>
          <ul className="space-y-1 text-[13px]">
            {order.risk_json.warnings.map((w, i) => (
              <li key={i} className={`flex gap-2 ${w.level === "bad" ? "text-owl-red" : w.level === "warn" ? "text-owl-amber" : "text-slate-400"}`}>
                <span>{w.level === "bad" ? "▲" : "•"}</span>
                <span>{w.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-line bg-white/[0.01] px-6 py-3.5">
        <span className="mr-auto max-w-[45%] truncate text-xs italic text-slate-500">“{order.raw_text}”</span>
        {order.status === "draft" && (
          <>
            <button className="btn" disabled={busy} onClick={discard}>
              丢弃草稿
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || order.risk_json.blocked}
              onClick={() => setSigning(true)}
            >
              ✍️ 签字确认
            </button>
          </>
        )}
        {order.status === "submitted" && (
          <button className="btn" disabled={busy} onClick={cancel}>
            撤单
          </button>
        )}
      </div>

      {signing && <SignDialog order={order} onConfirm={sign} onClose={() => setSigning(false)} />}
    </div>
  );
}
