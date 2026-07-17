// Single source of truth for converting an on-chain asset amount into the
// KES figure shown to admins and receivers. Disbursements are fixed to XLM
// (see FIXED_ASSET_CODE in DisbursementDetails), which has no stable
// real-world peg and isn't covered by the live USD/KES forex feed used
// elsewhere (see hooks/useUsdToKesRate.ts, which prices the org's USDC
// treasury balance — a different, correct use of a *different* rate). This
// is a fixed demo rate for the pilot; swap it for a real XLM/KES price feed
// before this handles non-testnet funds.
export const KES_RATES: Record<string, number> = {
  XLM: 40,
};

const DEFAULT_KES_RATE = KES_RATES.XLM;

export const formatAssetAmountAsKes = (amount: string, assetCode: string): string => {
  const rate = KES_RATES[assetCode?.toUpperCase()] ?? DEFAULT_KES_RATE;
  const kes = parseFloat(amount || "0") * rate;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(kes);
};
