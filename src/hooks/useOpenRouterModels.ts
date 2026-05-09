import { useEffect, useState } from 'react';

export interface OpenRouterModel {
  id: string;
  name: string;
}

interface CacheEnvelope {
  fetchedAt: number;
  models: OpenRouterModel[];
}

const CACHE_KEY = 'openrouter_models_v1';
const TTL_MS = 24 * 60 * 60 * 1000;

function loadCache(): CacheEnvelope | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (Date.now() - parsed.fetchedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchModels(): Promise<OpenRouterModel[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`);
  const json = (await res.json()) as { data: Array<{ id: string; name?: string }> };
  return json.data
    .map((m) => ({ id: m.id, name: m.name || m.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface UseOpenRouterModelsResult {
  models: OpenRouterModel[];
  loading: boolean;
  error: string | null;
}

export function useOpenRouterModels(): UseOpenRouterModelsResult {
  const cached = loadCache();
  const [models, setModels] = useState<OpenRouterModel[]>(cached?.models ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetchModels()
      .then((list) => {
        if (cancelled) return;
        setModels(list);
        setLoading(false);
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ fetchedAt: Date.now(), models: list }),
          );
        } catch {
          // localStorage quota or disabled — ignore, in-memory list still works
        }
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { models, loading, error };
}
