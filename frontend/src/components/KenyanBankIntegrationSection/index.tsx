import { useState } from "react";

import { Badge, Button, Card, CopyText, Icon, Notification } from "@stellar/design-system";
import { LoadingContent } from "@/components/LoadingContent";

import { useKenyanBankIntegration } from "@/apiQueries/useKenyanBankIntegration";
import { useUpdateKenyanBankIntegration } from "@/apiQueries/useUpdateKenyanBankIntegration";

import { formatDateTime } from "@/helpers/formatIntlDateTime";

import {
  KenyanBankDeposit,
  KenyanBankDepositStatus,
  KenyanBankIntegration,
  KenyanBankName,
} from "@/types";

import "./styles.scss";

const BANK_LABELS: Record<KenyanBankName, string> = {
  EQUITY: "Equity Bank",
  KCB: "KCB Bank",
};

const DEPOSIT_STATUS_LABELS: Record<KenyanBankDepositStatus, string> = {
  RECEIVED: "Received",
  PENDING_SWAP: "Converting",
  SWAPPED: "Credited",
  FAILED: "Failed",
};

const DEPOSIT_STATUS_VARIANTS: Record<
  KenyanBankDepositStatus,
  "success" | "warning" | "secondary" | "error"
> = {
  RECEIVED: "secondary",
  PENDING_SWAP: "warning",
  SWAPPED: "success",
  FAILED: "error",
};

// ── sub-components ────────────────────────────────────────────────────────────

const BankCard = ({
  integration,
  onActivate,
  onSuspend,
  isUpdating,
}: {
  integration: KenyanBankIntegration;
  onActivate: (bank: KenyanBankName) => void;
  onSuspend: (bank: KenyanBankName) => void;
  isUpdating: boolean;
}) => {
  const isActive = integration.status === "ACTIVE";
  const label = BANK_LABELS[integration.bank];

  return (
    <div className="KenyanBankIntegrationSection__bankCard">
      <div className="KenyanBankIntegrationSection__bankCard__header">
        <div className="KenyanBankIntegrationSection__bankCard__name">
          <Icon.BankNote01 />
          <span>{label}</span>
        </div>
        <Badge variant={isActive ? "success" : "secondary"}>
          {isActive ? "Active" : integration.status === "SUSPENDED" ? "Suspended" : "Not configured"}
        </Badge>
      </div>

      {isActive && integration.paybill_number && (
        <div className="KenyanBankIntegrationSection__bankCard__details">
          <div className="KenyanBankIntegrationSection__bankCard__detail">
            <span className="Label">Paybill number</span>
            <CopyText textToCopy={integration.paybill_number} doneLabel="Copied">
              <span className="KenyanBankIntegrationSection__bankCard__value">
                {integration.paybill_number}
              </span>
            </CopyText>
          </div>
          <div className="KenyanBankIntegrationSection__bankCard__detail">
            <span className="Label">Account number</span>
            <CopyText textToCopy={integration.account_number ?? ""} doneLabel="Copied">
              <span className="KenyanBankIntegrationSection__bankCard__value">
                {integration.account_number ?? "—"}
              </span>
            </CopyText>
          </div>
          {integration.activated_at && (
            <div className="KenyanBankIntegrationSection__bankCard__detail">
              <span className="Label">Activated</span>
              <span className="KenyanBankIntegrationSection__bankCard__value KenyanBankIntegrationSection__bankCard__value--secondary">
                {formatDateTime(integration.activated_at)}
                {integration.activated_by ? ` by ${integration.activated_by}` : ""}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="KenyanBankIntegrationSection__bankCard__actions">
        {isActive ? (
          <Button
            size="sm"
            variant="error"
            onClick={() => onSuspend(integration.bank)}
            isLoading={isUpdating}
          >
            Suspend
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onActivate(integration.bank)}
            isLoading={isUpdating}
          >
            Activate
          </Button>
        )}
      </div>
    </div>
  );
};

const DepositRow = ({ deposit }: { deposit: KenyanBankDeposit }) => {
  const statusVariant = DEPOSIT_STATUS_VARIANTS[deposit.status];
  const statusLabel = DEPOSIT_STATUS_LABELS[deposit.status];

  return (
    <tr className="KenyanBankIntegrationSection__depositRow">
      <td>{formatDateTime(deposit.received_at)}</td>
      <td>{BANK_LABELS[deposit.bank]}</td>
      <td>{deposit.sender_name ?? "—"}</td>
      <td className="KenyanBankIntegrationSection__depositRow__amount">
        KES {deposit.kes_amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
      </td>
      <td>
        {deposit.usdc_amount != null
          ? `${Number(deposit.usdc_amount).toFixed(7)} USDC`
          : "—"}
      </td>
      <td>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </td>
    </tr>
  );
};

// ── main component ────────────────────────────────────────────────────────────

export const KenyanBankIntegrationSection = () => {
  const { data, isLoading, error } = useKenyanBankIntegration();
  const { mutateAsync: update, isPending: isUpdating, error: updateError } =
    useUpdateKenyanBankIntegration();

  const [pendingBank, setPendingBank] = useState<KenyanBankName | null>(null);

  const handleActivate = async (bank: KenyanBankName) => {
    setPendingBank(bank);
    try {
      await update({ bank, status: "ACTIVE" });
    } finally {
      setPendingBank(null);
    }
  };

  const handleSuspend = async (bank: KenyanBankName) => {
    setPendingBank(bank);
    try {
      await update({ bank, status: "SUSPENDED" });
    } finally {
      setPendingBank(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <div className="CardStack__card">
          <div className="CardStack__title">Bank Transfer (Kenya)</div>
          <LoadingContent />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="CardStack__card">
          <div className="CardStack__title">Bank Transfer (Kenya)</div>
          <Notification variant="error" title="Error loading bank integrations" isFilled={true}>
            {error.message}
          </Notification>
        </div>
      </Card>
    );
  }

  const integrations = data?.integrations ?? [];
  const deposits = data?.recent_deposits ?? [];
  const hasActiveBank = integrations.some((i) => i.status === "ACTIVE");

  return (
    <>
      <Card>
        <div className="CardStack__card">
          <div className="CardStack__title">Bank Transfer (Kenya)</div>

          <div className="Note">
            Activate a bank to receive KES deposits directly into your account. Funds are
            automatically converted to USDC and reflected in your balance.
          </div>

          {updateError && (
            <Notification variant="error" title="Update failed" isFilled={true}>
              {updateError.message}
            </Notification>
          )}

          <div className="KenyanBankIntegrationSection__banks">
            {integrations.map((integration) => (
              <BankCard
                key={integration.id}
                integration={integration}
                onActivate={handleActivate}
                onSuspend={handleSuspend}
                isUpdating={isUpdating && pendingBank === integration.bank}
              />
            ))}
          </div>

          {hasActiveBank && (
            <div className="Note">
              Share the paybill number and account number above with your funders.
              Deposits will appear in the transaction history below within minutes.
            </div>
          )}
        </div>
      </Card>

      {deposits.length > 0 && (
        <Card>
          <div className="CardStack__card">
            <div className="CardStack__title">Recent deposits</div>
            <div className="KenyanBankIntegrationSection__depositsTable">
              <table>
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Bank</th>
                    <th>From</th>
                    <th>KES amount</th>
                    <th>USDC equiv.</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((d) => (
                    <DepositRow key={d.id} deposit={d} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </>
  );
};
