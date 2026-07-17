const kesFormatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Converts a USD/USDC-denominated balance amount into a formatted KES string
 * using a live exchange rate.
 */
export const formatKes = (usdAmount: string | number, usdToKesRate: number): string => {
  const amount = typeof usdAmount === "string" ? Number(usdAmount) : usdAmount;
  if (Number.isNaN(amount)) {
    return "-";
  }
  return kesFormatter.format(amount * usdToKesRate);
};
