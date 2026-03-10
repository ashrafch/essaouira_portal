import { useCallback, useEffect, useRef, useState } from "react";

function useAutoRefresh({
  onRefresh,
  intervalMs,
  enabled = true,
  immediate = false,
}) {
  const callbackRef = useRef(onRefresh);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  useEffect(() => {
    callbackRef.current = onRefresh;
  }, [onRefresh]);

  const refreshNow = useCallback(async () => {
    if (!callbackRef.current) return;
    setIsRefreshing(true);
    try {
      await callbackRef.current();
      setLastRefreshAt(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (immediate) {
      refreshNow();
    }

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      refreshNow();
    }, Math.max(5000, intervalMs || 15000));

    const onVisibilityChange = () => {
      if (!document.hidden) {
        refreshNow();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, immediate, intervalMs, refreshNow]);

  return {
    isRefreshing,
    lastRefreshAt,
    refreshNow,
  };
}

export default useAutoRefresh;
