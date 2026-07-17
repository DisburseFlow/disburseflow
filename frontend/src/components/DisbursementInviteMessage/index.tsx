import { useEffect } from "react";

import { Card } from "@stellar/design-system";

import "../ReceiverInviteMessage/styles.scss";

// Receivers are registered automatically by the backend (a wallet is created
// and funded for their phone number in the background, shortly after CSV
// upload — see internal/scheduler/jobs/wallet_provisioning_job.go) — there's
// no SEP-24 "click this link to register" step, so there's nothing for the
// admin to customize here. This used to be an editable invite message with a
// registration link; it's now a fixed, informational note plus a fixed
// message template, since the old one always appended a registration link
// that would never apply to these receivers.
const RECEIVER_MESSAGE_TEMPLATE = "You have received a payment from {{.OrganizationName}}.";

interface DisbursementInviteMessageProps {
  onChange?: (message: string) => void;
}

export const DisbursementInviteMessage = ({ onChange }: DisbursementInviteMessageProps) => {
  useEffect(() => {
    onChange?.(RECEIVER_MESSAGE_TEMPLATE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <div className="CardStack__card ReceiverInviteMessage">
        <div className="CardStack__title">Receiver notification</div>

        <div className="Note">
          Receivers won&rsquo;t be asked to register a wallet — one is created and funded for
          them automatically in the background after this disbursement is submitted.
        </div>
      </div>
    </Card>
  );
};
