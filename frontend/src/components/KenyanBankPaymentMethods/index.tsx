import { Badge, Icon } from "@stellar/design-system";

import "./styles.scss";

interface KenyanBank {
  id: string;
  name: string;
}

const SUPPORTED_BANKS: KenyanBank[] = [
  { id: "equity", name: "Equity Bank" },
  { id: "kcb", name: "KCB Bank" },
];

/**
 * Lists Kenyan bank transfer options for funding the account.
 *
 * NOTE: This is a UI scaffold. There is no backend integration yet for
 * Kenyan bank rails (unlike the existing Bridge integration, which only
 * supports US ACH/wire). To make this functional, the backend needs:
 *   1. A payment processor/PSP integration that supports Kenyan bank
 *      transfers (e.g. a local aggregator), similar in shape to the
 *      existing `BridgeIntegration` status machine
 *      (NOT_OPTED_IN -> OPTED_IN -> READY_FOR_DEPOSIT).
 *   2. An endpoint returning the client's dedicated account number/paybill
 *      per bank, analogous to `useBridgeIntegration`.
 *   3. A webhook/listener that converts incoming KES deposits to USDC on
 *      the distribution account, same role Bridge currently plays for USD.
 *
 * Once that exists, replace the "Coming soon" badges below with real
 * account details (reuse the `BridgeAccountDetails` layout pattern).
 */
export const KenyanBankPaymentMethods = () => {
  return (
    <div className="KenyanBankPaymentMethods">
      <div className="Note">
        Fund your account directly from a Kenyan bank account. Deposits are converted
        automatically and reflected in your account balance.
      </div>

      <div className="KenyanBankPaymentMethods__list">
        {SUPPORTED_BANKS.map((bank) => (
          <div key={bank.id} className="KenyanBankPaymentMethods__item">
            <div className="KenyanBankPaymentMethods__itemInfo">
              <Icon.BankNote01 />
              <span>{bank.name}</span>
            </div>
            <Badge variant="secondary">Coming soon</Badge>
          </div>
        ))}
      </div>
    </div>
  );
};
