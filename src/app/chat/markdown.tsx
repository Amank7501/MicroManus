import { createContext, useContext } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// react-markdown sanitizes link URLs by default, allowing only http(s)/
// mailto/relative — any other scheme (including our internal "citation:"
// marker) gets silently rewritten to an empty string. Let citation: links
// through unchanged; defer to the default sanitizer for everything else.
function urlTransform(url: string): string {
  return url.startsWith("citation:") ? url : defaultUrlTransform(url);
}

export type Source = { title: string; url: string };

const SourcesContext = createContext<Map<number, Source> | null>(null);

// Turns "...doubled [2]." into "...doubled [2](citation:2)." — only for
// indices actually present in `sources`, so a stray "[3]" that isn't a real
// citation (rare, but markdown allows literal brackets) renders as plain text
// instead of a broken link.
function linkifyCitations(content: string, sources: Map<number, Source> | null): string {
  if (!sources || sources.size === 0) return content;
  return content.replace(/\[(\d+)\]/g, (match, digits) => {
    const index = Number(digits);
    return sources.has(index) ? `[${index}](citation:${index})` : match;
  });
}

function CitationLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const sources = useContext(SourcesContext);
  const index = href?.startsWith("citation:") ? Number(href.slice("citation:".length)) : null;
  const source = index !== null ? sources?.get(index) : undefined;

  if (index !== null && source) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        title={source.title}
        className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-black/[.08] px-1 align-super text-[0.65em] font-medium leading-none text-zinc-700 no-underline hover:bg-black/[.15] dark:bg-white/[.15] dark:text-zinc-300 dark:hover:bg-white/[.25]"
      >
        {index}
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4 hover:opacity-80"
    >
      {children}
    </a>
  );
}

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
  a: CitationLink,
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

type Props = {
  content: string;
  sources?: Map<number, Source>;
};

export default function Markdown({ content, sources }: Props) {
  return (
    <SourcesContext.Provider value={sources ?? null}>
      <div className="text-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>
          {linkifyCitations(content, sources ?? null)}
        </ReactMarkdown>
      </div>
    </SourcesContext.Provider>
  );
}
