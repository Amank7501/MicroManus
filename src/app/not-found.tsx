import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 text-center font-sans dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Page not found
      </h1>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
        This page doesn&apos;t exist, or the chat it points to may have been removed.
      </p>
      <Link
        href="/dashboard"
        className="flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
