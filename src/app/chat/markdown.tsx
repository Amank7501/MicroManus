import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-4 mb-2 text-lg font-semibold tracking-tight text-black first:mt-0 dark:text-zinc-50">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-4 mb-2 text-base font-semibold tracking-tight text-black first:mt-0 dark:text-zinc-50">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 mb-1.5 text-sm font-semibold text-black first:mt-0 dark:text-zinc-50">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="leading-relaxed [&:not(:first-child)]:mt-3">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-1 pl-5 leading-relaxed first:mt-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-1 pl-5 leading-relaxed first:mt-0">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4 hover:opacity-80"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    const isBlock = Boolean(className);
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-black/[.06] px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/[.1]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-black/[.06] p-3 font-mono text-xs leading-relaxed first:mt-0 dark:bg-white/[.08]">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-black/15 pl-3 italic text-zinc-600 first:mt-0 dark:border-white/20 dark:text-zinc-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-black/[.08] dark:border-white/[.145]" />,
  table: ({ children }) => (
    <div className="mt-3 overflow-x-auto rounded-lg border border-black/[.08] first:mt-0 dark:border-white/[.145]">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-black/[.08] dark:border-white/[.145]">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-t border-black/[.05] px-3 py-2 dark:border-white/[.08]">{children}</td>
  ),
};

export default function Markdown({ content }: { content: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
