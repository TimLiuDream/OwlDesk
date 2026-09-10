"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Chat message markdown renderer.
 * react-markdown never emits raw HTML from the model output (safe by
 * default — no dangerouslySetInnerHTML anywhere), so LLM text can't inject
 * markup. Styling: compact "owl prose" tuned for chat bubbles.
 */
export default function Markdown({ text }: { text: string }) {
  return (
    <div className="owl-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a className="text-owl-blue underline underline-offset-2" {...props} />,
          code: ({ node: _node, ...props }) => (
            <code className="rounded bg-night-950/70 px-1 py-0.5 font-mono text-[0.85em] text-owl-teal" {...props} />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
