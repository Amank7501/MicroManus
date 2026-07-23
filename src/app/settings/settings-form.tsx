"use client";

import { useState } from "react";
import { PROVIDERS, getProvider, type Provider } from "@/lib/models";

const CUSTOM_MODEL = "__custom__";

type Status = "connected" | "failed" | "untested" | null;

type Props = {
  initialProvider: string | null;
  initialEndpoint: string | null;
  initialModel: string | null;
  initialStatus: string | null;
};

export default function SettingsForm({
  initialProvider,
  initialEndpoint,
  initialModel,
  initialStatus,
}: Props) {
  const startProvider = (initialProvider as Provider) ?? PROVIDERS[0].id;
  const startProviderInfo = getProvider(startProvider) ?? PROVIDERS[0];
  const startIsCustomModel = Boolean(
    initialModel && !startProviderInfo.models.includes(initialModel),
  );

  const [provider, setProvider] = useState<Provider>(startProvider);
  const [endpoint, setEndpoint] = useState(initialEndpoint ?? startProviderInfo.defaultEndpoint);
  const [modelChoice, setModelChoice] = useState(
    startIsCustomModel || startProviderInfo.models.length === 0
      ? CUSTOM_MODEL
      : (initialModel ?? startProviderInfo.models[0]),
  );
  const [customModel, setCustomModel] = useState(startIsCustomModel ? (initialModel ?? "") : "");
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>((initialStatus as Status) ?? null);

  const hasSavedCredentials = initialStatus !== null;

  function handleProviderChange(next: Provider) {
    const nextInfo = getProvider(next)!;
    const prevInfo = getProvider(provider)!;
    setProvider(next);
    setModelChoice(nextInfo.models.length === 0 ? CUSTOM_MODEL : nextInfo.models[0]);
    setCustomModel("");
    if (endpoint === "" || endpoint === prevInfo.defaultEndpoint) {
      setEndpoint(nextInfo.defaultEndpoint);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const model = modelChoice === CUSTOM_MODEL ? customModel.trim() : modelChoice;

    try {
      const res = await fetch("/api/settings/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, endpoint, model, apiKey, username, password }),
      });
      const data = await res.json();

      setLoading(false);

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      setStatus(data.status);
      setError(data.status === "failed" ? data.message ?? "Connection failed" : null);
      setApiKey("");
      setUsername("");
      setPassword("");
    } catch {
      setLoading(false);
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  const providerInfo = getProvider(provider)!;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Provider</label>
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as Provider)}
          className="h-11 w-full rounded-lg border border-black/[.08] bg-transparent px-3 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/30"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {providerInfo.id === "ollama" ? "Base URL" : "Endpoint"}
        </label>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder={providerInfo.defaultEndpoint}
          className="h-11 w-full rounded-lg border border-black/[.08] bg-transparent px-3 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/30"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Model</label>
        {providerInfo.models.length > 0 && (
          <select
            value={modelChoice}
            onChange={(e) => setModelChoice(e.target.value)}
            className="h-11 w-full rounded-lg border border-black/[.08] bg-transparent px-3 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/30"
          >
            {providerInfo.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={CUSTOM_MODEL}>Custom model id…</option>
          </select>
        )}
        {(modelChoice === CUSTOM_MODEL || providerInfo.models.length === 0) && (
          <input
            type="text"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder={providerInfo.id === "ollama" ? "e.g. llama3.1:8b" : "e.g. gpt-5.1-turbo"}
            className="h-11 w-full rounded-lg border border-black/[.08] bg-transparent px-3 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/30"
          />
        )}
      </div>

      {providerInfo.authType === "api_key" ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            placeholder={hasSavedCredentials ? "•••••••• saved — leave blank to keep" : "sk-…"}
            className="h-11 w-full rounded-lg border border-black/[.08] bg-transparent px-3 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/30"
          />
        </div>
      ) : (
        <>
          <p className="-mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            Only needed if your Ollama instance sits behind Basic Auth (e.g. a reverse proxy).
            Leave both blank for a local, unprotected instance.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Username <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              placeholder={hasSavedCredentials ? "saved — leave blank to keep" : "optional"}
              className="h-11 w-full rounded-lg border border-black/[.08] bg-transparent px-3 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/30"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              placeholder={hasSavedCredentials ? "•••••••• saved — leave blank to keep" : "optional"}
              className="h-11 w-full rounded-lg border border-black/[.08] bg-transparent px-3 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:focus:border-white/30"
            />
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
      >
        {loading ? "Testing connection…" : "Save & test connection"}
      </button>

      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Status:</span>
        {status === "connected" && (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
            Connected
          </span>
        )}
        {status === "failed" && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
            Failed
          </span>
        )}
        {!status && (
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            Not connected
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
