"use client";

import { useState, useEffect } from "react";
import { getMarketSentimentAction, MarketSentiment } from "../../actions";

interface UseMarketSentimentReturn {
  sentiment: MarketSentiment | null;
  loading: boolean;
  error: Error | null;
}

/**
 * 获取市场情绪数据的 Hook
 */
export function useMarketSentiment(communityId: string): UseMarketSentimentReturn {
  const [sentiment, setSentiment] = useState<MarketSentiment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchSentiment = async () => {
      if (!communityId || communityId.trim() === "") {
        setSentiment(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await getMarketSentimentAction(communityId);
        if (isMounted) {
          setSentiment(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error("获取市场情绪数据失败"));
          setSentiment(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchSentiment();

    return () => {
      isMounted = false;
    };
  }, [communityId]);

  return { sentiment, loading, error };
}
