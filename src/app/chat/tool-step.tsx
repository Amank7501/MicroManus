type ToolStepProps = {
  kind: "search" | "pdf" | "unknown";
  label: string;
  status: "ok" | "error";
};

const ICONS: Record<ToolStepProps["kind"], string> = {
  search: "🔍",
  pdf: "📝",
  unknown: "🛠️",
};

export default function ToolStep({ kind, label, status }: ToolStepProps) {
  return (
    <div className="mr-auto flex max-w-[85%] items-center gap-2 rounded-lg border border-black/[.06] bg-black/[.02] px-3 py-1.5 text-xs dark:border-white/[.08] dark:bg-white/[.04]">
      <span aria-hidden className="shrink-0">
        {ICONS[kind]}
      </span>
      <span
        className={
          status === "error"
            ? "text-red-600 dark:text-red-400"
            : "text-zinc-600 dark:text-zinc-400"
        }
      >
        {label}
      </span>
    </div>
  );
}
