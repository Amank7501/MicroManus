# CLAUDE.md — MicroManus

This file is the source of truth for building **MicroManus**. Re-read it at the start of every session. Do not drift from these decisions without being told.

---

## What we're building

A deployed web app called **MicroManus** — a deep-research AI agent (Perplexity/Manus-style) with a usage-based billing system. Users sign up, pass a paywall, connect their own LLM key, and chat with an agent that searches the web and can produce PDF reports. A stats page shows per-chat cost.

This is a take-home assignment. The bar is: **it must actually work end-to-end on a live URL when a stranger tests it.** A broken flow = disqualification.

---

## Hard requirements (from the assignment)

- **Auth:** social login ONLY (GitHub or Google). No email/password.
- **Paywall after signup.** Two ways past it, both grant **5 credits**:
  1. Coupon code `SID_DRDROID`, OR
  2. Real card payment for "$5" (charged as the INR equivalent).
- **Chat agent** with internet access and conversation threads:
  - Holds context within a thread.
  - Runs an agentic loop: think → tool call → read output → think → repeat → final answer.
  - Can start new chats.
  - Can produce a **PDF report** artifact when appropriate.
- **Bring-your-own key:** user supplies an OpenAI-compatible API key + endpoint. Support 3–4 latest popular **Claude, OpenAI, and Kimi** models. Caching enabled.
- **Cost & stats page:** per-chat cost, split by **input / output / cached** tokens, priced by the selected model's rates.
- Must be a **live web URL** (not localhost, not a repo link).

---

## Locked decisions

- **Credit = 1 agent run** (one research task). User starts with 5. Decrement on completed run.
- **Credits vs dollars are separate concepts:** credits gate access; the stats page shows real $ cost from token usage. Don't conflate them.
- **Payment:** label the price **"$5"** in the UI, charge the **INR equivalent (~₹415)** via Razorpay test mode.
- **Never hardcode or pre-load any LLM API key.** The user always supplies it.
- Store per-user API keys securely (encrypted / server-side), never exposed to the client bundle.

---

## Stack

- **Framework:** Next.js (App Router). Frontend + API routes in one codebase; agent loop runs server-side.
- **Hosting:** Vercel (deploy from GitHub, gives the live URL).
- **Auth + DB + key storage:** Supabase (OAuth, Postgres, secure storage).
- **Payments:** Razorpay test mode.
- **Web search:** Tavily API (free tier, built for AI agents, ~1,000 searches/month, no card required). Requires a free API key.
- **PDF:** server-side generation.

---

## Data model (initial)

- `users` — from Supabase auth.
- `credits` — user_id, balance.
- `api_keys` — user_id, provider, endpoint, encrypted key, selected model.
- `chats` — id, user_id, title, created_at.
- `messages` — id, chat_id, role, content, created_at.
- `usage` — message_id (or chat_id), model, input_tokens, output_tokens, cached_tokens, cost.
- `payments` — user_id, method (coupon/razorpay), amount, status.

---

## Build in phases — ONE AT A TIME

Do not race ahead. Build only the current phase, stop, and let me test the acceptance outcome before starting the next.

| Phase | Deliverable | Acceptance test |
|-------|-------------|-----------------|
| 0 | Deploy skeleton | Live URL loads for a stranger |
| 1 | Social login (GitHub/Google) | Sign in works, routes protected |
| 2 | Paywall + coupon → 5 credits | Coupon unlocks app, credits stored |
| 3 | BYO API key + model select | Key saved, validated, bad key rejected |
| 4 | Chat with threads | Multi-turn context, new chats |
| 5 | Agent loop + web search | Research prompt uses live search |
| 6 | PDF report artifact | Downloadable report generated |
| 7 | Cost & stats dashboard | Per-chat cost split by token type |
| 8 | Razorpay real payment | Test card → 5 credits |
| 9 | Polish + friend test | Clean-account full run works |

---

## Working rules for the agent

- Scope work to the current phase only. Ask before expanding scope.
- After each phase, state the exact manual steps I must do (accounts, OAuth apps, env vars, keys).
- Never commit secrets. Use `.env.local`; list required env vars in `.env.example`.
- Keep the UI self-explanatory — no instructions needed to use it.
- Flag anything that can't be done in code (external dashboards, KYC, deploys) explicitly.
