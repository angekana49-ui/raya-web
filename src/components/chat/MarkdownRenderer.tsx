"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";

// ─── Markdown + LaTeX component map ──────────────────────────────────────────
const PROSE: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-extrabold text-slate-900 mt-6 mb-3 first:mt-0 tracking-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-bold text-slate-900 mt-5 mb-2.5 first:mt-0 tracking-tight">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-bold text-slate-800 mt-4 mb-2 first:mt-0 tracking-tight">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-[1.7]">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2.5 space-y-1 pl-5 list-disc marker:text-primary/60">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2.5 space-y-1 pl-5 list-decimal marker:text-gray-500">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-[1.65] pl-0.5">{children}</li>,
  code: ({ className, children }) => {
    const isBlock = !!className;
    if (isBlock) {
      return <code className={`${className} font-mono text-sm`}>{children}</code>;
    }
    return (
      <code className="bg-slate-100 text-slate-800 border border-slate-200 rounded-md px-1.5 py-0.5 text-[0.82em] font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-slate-900 text-slate-100 rounded-xl px-4 py-3.5 my-3 overflow-x-auto text-sm font-mono leading-relaxed">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-[3px] border-primary/50 pl-4 my-3 text-gray-600 italic bg-primary/[0.03] rounded-r-lg py-1">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-3 rounded-xl border border-slate-200 shadow-sm">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50 border-b border-slate-200">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold text-slate-700 text-xs uppercase tracking-wide">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 border-b border-slate-100 text-gray-700">{children}</td>
  ),
  tr: ({ children }) => <tr className="even:bg-slate-50/50">{children}</tr>,
  hr: () => <hr className="border-slate-200 my-4" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/75 transition-colors"
    >
      {children}
    </a>
  ),
};

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
      components={PROSE}
    >
      {content}
    </ReactMarkdown>
  );
}
