import "server-only";

export type SearchResult = {
  title: string;
  url: string;
  content: string;
};

export async function webSearch(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not set");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 5,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Tavily search failed with status ${res.status}`);
    }

    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];

    return results.map((r: Record<string, unknown>) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      content: String(r.content ?? "").slice(0, 1500),
    }));
  } finally {
    clearTimeout(timeout);
  }
}
