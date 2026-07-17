import { useState } from "react";

import { Button, Icon, Input, Modal, Notification } from "@stellar/design-system";

import { formatDateTimeWithSeconds } from "@/helpers/formatIntlDateTime";
import {
  type DeliveryConfirmation as DeliveryRecord,
  deliveryConfirmations,
} from "@/helpers/localStorageDeliveryConfirmations";

import "./styles.scss";

interface DeliveryConfirmationProps {
  paymentId: string;
  isPaymentSuccess: boolean;
}

export const DeliveryConfirmation = ({ paymentId, isPaymentSuccess }: DeliveryConfirmationProps) => {
  const [confirmation, setConfirmation] = useState<DeliveryRecord | undefined>(
    () => deliveryConfirmations.get(paymentId),
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [notes, setNotes] = useState("");

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const record: DeliveryRecord = {
      paymentId,
      agentName: agentName.trim(),
      confirmedAt: new Date().toISOString(),
      notes: notes.trim(),
    };
    deliveryConfirmations.save(record);
    setConfirmation(record);
    setIsModalOpen(false);
    setAgentName("");
    setNotes("");
  };

  const handleOpenModal = () => {
    setAgentName("");
    setNotes("");
    setIsModalOpen(true);
  };

  if (confirmation) {
    return (
      <div className="DeliveryConfirmation DeliveryConfirmation--confirmed">
        <div className="DeliveryConfirmation__header">
          <Icon.CheckCircle />
          <span className="DeliveryConfirmation__title">Delivery confirmed</span>
        </div>
        <div className="DeliveryConfirmation__meta">
          <span>
            By <strong>{confirmation.agentName}</strong>
          </span>
          <span className="DeliveryConfirmation__ts">
            {formatDateTimeWithSeconds(confirmation.confirmedAt)}
          </span>
        </div>
        {confirmation.notes ? (
          <div className="DeliveryConfirmation__notes">{confirmation.notes}</div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="DeliveryConfirmation">
        <div className="DeliveryConfirmation__header">
          <Icon.AlertCircle />
          <span className="DeliveryConfirmation__title">Delivery not yet confirmed</span>
        </div>
        {!isPaymentSuccess ? (
          <p className="DeliveryConfirmation__hint">
            Available once the payment reaches SUCCESS status.
          </p>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleOpenModal}
          disabled={!isPaymentSuccess}
        >
          Confirm delivery
        </Button>
      </div>

      <Modal visible={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <Modal.Heading>Confirm Delivery</Modal.Heading>
        <form onSubmit={handleConfirm} onReset={() => setIsModalOpen(false)}>
          <Modal.Body>
            <Notification variant="primary" title="Agent sign-off" isFilled>
              Record who physically confirmed the participant received funds.
            </Notification>
            <Input
              fieldSize="sm"
              id="dc-agent-name"
              name="dc-agent-name"
              label="Agent name"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
            />
            <Input
              fieldSize="sm"
              id="dc-notes"
              name="dc-notes"
              label="Notes (optional)"
              placeholder="Location, method, any observations…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button size="md" variant="tertiary" type="reset">
              Cancel
            </Button>
            <Button
              size="md"
              variant="primary"
              type="submit"
              disabled={!agentName.trim()}
            >
              Confirm delivery
            </Button>
          </Modal.Footer>
        </form>
      </Modal>
    </>
  );
};
