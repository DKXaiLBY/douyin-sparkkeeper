import { useCallback, useEffect, useState } from 'react';
import { api } from '@/api/client.ts';
import type { AppConfig } from '@/api/types.ts';

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const c = await api.config.get();
      setConfig(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback(
    async (patch: unknown): Promise<AppConfig> => {
      const next = await api.config.update(patch);
      setConfig(next);
      return next;
    },
    [],
  );

  return { config, loading, error, refresh, update };
}
