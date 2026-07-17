import { ApiPayment } from "@/types";

/**
 * Maps a payment to a client-friendly category label for display in the
 * Payments table "Type" column.
 *
 * NOTE: The backend `ApiPayment.type` field currently only distinguishes
 * between "DISBURSEMENT" (came from a bulk disbursement) and "DIRECT"
 * (a one-off payment sent directly to a receiver). It does not yet know
 * about finer-grained business categories like "Staff Salaries",
 * "Allowances", or "Tenders" - those require a new field on the payment
 * (e.g. `category`) set at creation time, plus a backend migration.
 *
 * Until that lands, this helper:
 *  - Labels DISBURSEMENT payments as "Disbursement"
 *  - Labels DIRECT payments as "Direct Payment"
 *  - Passes through any future category the backend starts sending
 *    (e.g. "STAFF_SALARIES", "ALLOWANCES", "TENDERS") with a readable label,
 *    so the UI is ready as soon as the backend supports it.
 */
const KNOWN_TYPE_LABELS: Record<string, string> = {
  DISBURSEMENT: "Disbursement",
  DIRECT: "Direct Payment",
  STAFF_SALARIES: "Staff Salaries",
  ALLOWANCES: "Allowances",
  TENDERS: "Tenders",
};

export const formatPaymentType = (payment: Pick<ApiPayment, "type">): string => {
  const rawType = payment.type as string;
  if (KNOWN_TYPE_LABELS[rawType]) {
    return KNOWN_TYPE_LABELS[rawType];
  }

  // Fallback: turn SOME_TYPE into "Some type" for any unrecognized value
  return rawType
    .toLowerCase()
    .split("_")
    .map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
};
