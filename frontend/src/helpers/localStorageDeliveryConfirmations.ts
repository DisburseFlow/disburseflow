export type DeliveryConfirmation = {
  paymentId: string;
  agentName: string;
  confirmedAt: string;
  notes: string;
};

const STORAGE_KEY = "sdp_delivery_confirmations";

const getAll = (): Record<string, DeliveryConfirmation> => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<
      string,
      DeliveryConfirmation
    >;
  } catch {
    return {};
  }
};

const get = (paymentId: string): DeliveryConfirmation | undefined => getAll()[paymentId];

const save = (confirmation: DeliveryConfirmation): void => {
  const all = getAll();
  all[confirmation.paymentId] = confirmation;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
};

export const deliveryConfirmations = { get, save, getAll };
