# CLAUDE.md — MicroManus

This file is the source of truth for **MicroManus**. Re-read it at the start of every session. Do not drift from these decisions without being told.

---

## What this is

**MicroManus** is a deployed, portfolio-quality deep-research AI agent (Perplexity/Manus-style) with usage-based billing. Users sign up, pass a paywall, connect their own LLM key, and chat with an agent that searches the web and can produce PDF reports. A stats page shows per-chat cost.

The goal is a polished, demonstrable product — something that holds up when someone actually uses it, not just a checklist of features.

---

## Locked decisions

- **Auth:** social login only (GitHub or Google). No email/password.
- **Paywall after signup.** Two ways past it, both grant **5 credits**:
  1. Coupon code `SID_DRDROID`, OR
  2. Real card payment for "$5" (charged as the INR equivalent, ₹483 in Razorpay test mode).
- **Credit = 1 agent run** (one research task). User starts with 5. Decrement on completed run.
- **Credits vs dollars are separate concepts:** credits gate access; the stats page shows real $ cost from token usage. Don't conflate them.
- **Never hardcode or pre-load any LLM API key.** The user always supplies it.
- Store per-user API keys (and Ollama credentials) securely — encrypted, server-side, never exposed to the client bundle.

---

## Stack

- **Framework:** Next.js (App Router). Frontend + API routes in one codebase; agent loop runs server-side.
- **Hosting:** Vercel (deploy from GitHub, gives the live URL).
- **Auth + DB + key storage:** Supabase (OAuth, Postgres, secure storage).
- **Payments:** Razorpay test mode.
- **Web search:** Tavily API.
- **PDF:** server-side generation.

---

## Data model

- `users` — from Supabase auth.
- `credits` — user_id, balance.
- `api_keys` — user_id, provider, endpoint, auth_type, encrypted key (or encrypted username/password for Ollama), selected model, status.
- `chats` — id, user_id, title, created_at.
- `messages` — id, chat_id, role, content, tool_calls, tool_call_id, seq, created_at.
- `usage` — message_id, chat_id, user_id, model, input_tokens, output_tokens, cached_tokens, cost.
- `payments` — user_id, method (coupon/razorpay), amount, status, razorpay_order_id, razorpay_payment_id.
- `reports` — id, user_id, chat_id, title, storage_path, created_at.

---

## Current state

Everything below is built and working on the live deployment:

- Social login (GitHub/Google) via Supabase, all app routes gated by middleware.
- Paywall with both unlock paths (coupon and Razorpay test-mode payment), each granting 5 credits exactly once.
- BYO LLM connection: OpenAI, Claude (Anthropic), Kimi (Moonshot), Groq, and self-hosted Ollama (Basic Auth instead of an API key). Keys/credentials encrypted at rest; connection is live-tested on save.
- Chat with persistent threads, full context held across turns.
- Agentic loop (think → tool call → read output → think → final answer) with:
  - Web search (Tavily), model decides when to call it.
  - PDF report generation as a second tool, downloadable, ownership-checked.
  - Resilience: retries once on tool-call failure, falls back to a plain answer rather than erroring out, and the model is told explicitly not to hallucinate a search or report it didn't actually do.
  - Current date injected into the system prompt so time-sensitive queries don't anchor on stale training data.
- Token usage tracked per model call (input/output/cached) with a per-model pricing config; cost/stats page shows per-chat and total spend.
- Credit decrement of 1 per completed agent run.
- UI: loading/error/empty states throughout, markdown rendering for assistant answers, compact tool-step blocks, custom 404/error pages, self-explanatory copy (no instructions needed to use it).

---

## Roadmap

Not yet built — candidates for the next round of work:

- **Streaming responses** — answers currently arrive all at once after the full agent loop completes; token-by-token streaming would improve perceived latency, especially on longer research answers.
- **Citations** — surface the actual source URLs a search result came from inline in the final answer, not just as a "found N results" step block.
- **Richer tools** — beyond web search and PDF generation: e.g. code execution/data analysis, file upload for the agent to read, additional search providers.
- Real per-provider prompt-caching verification (confirm cache hits actually show up for providers beyond OpenAI).
- Team/org accounts, shared chats, or a public read-only share link for a generated report.

---

## Working rules for the agent

- Scope work to exactly what's requested. Ask before expanding scope.
- After any change with manual steps required (accounts, OAuth apps, env vars, keys, dashboard config), state them explicitly.
- Never commit secrets. Use `.env.local`; list required env vars in `.env.example`.
- Keep the UI self-explanatory — no instructions needed to use it.
- Flag anything that can't be done in code (external dashboards, KYC, deploys) explicitly.

---

## Commit messages

Write at the feature/user level, not the file level. Describe what changed for the user or the product — not which functions or files were touched.

- Subject line: imperative mood, under ~70 chars.
- Optionally, a blank line then 1–3 bullets of context on *why*.

**Good:**
- "Stream agent responses in real time"
- "Show source citations for research answers"
- "Fix stale dates in time-sensitive searches"

**Avoid:**
- "Update agent.ts and route.ts"
- "Refactor callModel signature"
- "Add usage field to AgentStep"
