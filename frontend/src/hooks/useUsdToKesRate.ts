import { useEffect, useState, useCallback } from "react";

const KES_RATE_POLL_INTERVAL_MS = 60_000;
// Public, no-key exchange rate API. Swap this out for a paid/rate-limited
// provider (or a backend-proxied endpoint) before relying on this in
// production at scale.
const FX_RATE_URL = "https://open.er-api.com/v6/latest/USD";

type UsdToKesRateState = {
  rate: number | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
};

/**
 * Polls a live USD -> KES exchange rate so account balances (held on-chain
 * in USDC) can be shown to Kenyan clients in KES, in real time, without
 * exposing them to USD/USDC terminology.
 */
export const useUsdToKesRate = (): UsdToKesRateState => {
  const [state, setState] = useState<UsdToKesRateState>({
    rate: null,
    isLoading: true,
    error: null,
    lastUpdated: null,
  });

  const fetchRate = useCallback(async () => {
    try {
      const response = await fetch(FX_RATE_URL);
      if (!response.ok) {
        throw new Error(`Exchange rate request failed with status ${response.status}`);
      }
      const data = await response.json();
      const kesRate = data?.rates?.KES;

      if (typeof kesRate !== "number") {
        throw new Error("KES rate missing from exchange rate response");
      }

      setState({
        rate: kesRate,
        isLoading: false,
        error: null,
        lastUpdated: new Date(),
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to fetch exchange rate",
      }));
    }
  }, []);

  useEffect(() => {
    fetchRate();
    const interval = setInterval(fetchRate, KES_RATE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchRate]);

  return state;
};
