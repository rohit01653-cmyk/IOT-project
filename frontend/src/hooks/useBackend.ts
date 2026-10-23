import { useCallback, useState } from 'react';

const TIMEOUT_MS = 4000;

async function postJson(url: string, body: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export function useBackend(base: string) {
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(
    async (path: string, body: unknown = {}) => {
      try {
        await postJson(`${base}${path}`, body);
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Request failed';
        if (e instanceof DOMException && e.name === 'AbortError') {
          setError('The server did not respond in time.');
        } else {
          setError(msg);
        }
      }
    },
    [base],
  );

  return { error, setError, call };
}

export async function fetchMaps(base: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/maps`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Failed to load maps (${res.status})`);
    const data = (await res.json()) as { maps: string[] };
    return data.maps ?? [];
  } finally {
    clearTimeout(timer);
  }
}
