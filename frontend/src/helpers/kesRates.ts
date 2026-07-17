export const KES_RATES: Record<string, number> = {
  USDC: 130,
  EURC: 143,
  XLM: 40,
  SRT: 130,
};

export const formatKes = (amount: string, assetCode: string): string => {
  const rate = KES_RATES[assetCode?.toUpperCase()] ?? 130;
  const kes = parseFloat(amount || "0") * rate;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(kes);
};
