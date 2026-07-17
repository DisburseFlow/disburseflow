import { useEffect, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import {
  Button,
  Card,
  Heading,
  Notification,
  Select,
  Modal,
} from "@stellar/design-system";

import { AssetAmount } from "@/components/AssetAmount";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CopyWithIcon } from "@/components/CopyWithIcon";
import { ErrorWithExtras } from "@/components/ErrorWithExtras";
import { InfoTooltip } from "@/components/InfoTooltip";
import { LoadingContent } from "@/components/LoadingContent";
import { NotificationWithButtons } from "@/components/NotificationWithButtons";
import { ReceiverPayments } from "@/components/ReceiverPayments";
import { ReceiverWalletBalance } from "@/components/ReceiverWalletBalance";
import { SectionHeader } from "@/components/SectionHeader";

import { GENERIC_ERROR_MESSAGE, Routes } from "@/constants/settings";

import { useReceiversReceiverId } from "@/apiQueries/useReceiversReceiverId";
import { useReceiverWalletInviteSmsRetry } from "@/apiQueries/useReceiverWalletInviteSmsRetry";
import { useUpdateReceiverWalletStatus } from "@/apiQueries/useUpdateReceiverWalletStatus";

import { formatDateTime } from "@/helpers/formatIntlDateTime";
import { percent } from "@/helpers/formatIntlNumber";
import { renderNumberOrDash } from "@/helpers/renderNumberOrDash";
import { renderTextWithCount } from "@/helpers/renderTextWithCount";

import { ReceiverDetails as ReceiverDetailsType, ReceiverWallet } from "@/types";

export const ReceiverDetails = () => {
  const { id: receiverId } = useParams();

  const [selectedWallet, setSelectedWallet] = useState<ReceiverWallet>();
  const [isResetModalVisible, setIsResetModalVisible] = useState(false);

  const {
    data: receiverDetails,
    isSuccess: isReceiverDetailsSuccess,
    isLoading: isReceiverDetailsLoading,
    error: receiverDetailsError,
  } = useReceiversReceiverId<ReceiverDetailsType>({
    receiverId,
    dataFormat: "receiver",
  });

  const {
    isSuccess: isInvitationRetrySuccess,
    isFetching: isInvitationRetryFetching,
    isError: isInvitationRetryError,
    error: invitationRetryError,
    refetch: retryReceiverInvitation,
  } = useReceiverWalletInviteSmsRetry(selectedWallet?.id);

  const {
    mutateAsync: unregisterWallet,
    isPending: isUnregisterWalletPending,
    isSuccess: isUnregisterWalletSuccess,
    isError: isUnregisterWalletError,
    error: unregisterWalletError,
    reset: resetUnregisterWallet,
  } = useUpdateReceiverWalletStatus();

  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(
    receiverDetails?.wallets?.[0]?.id,
  );

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const stats = receiverDetails?.stats;
  const defaultWalletId = receiverDetails?.wallets?.[0]?.id;

  const resetInvitationRetry = () => {
    queryClient.resetQueries({
      queryKey: ["receivers", "wallets", "sms", "retry"],
    });
  };

  useEffect(() => {
    if (isReceiverDetailsSuccess) {
      setSelectedWalletId(defaultWalletId);
    }
  }, [defaultWalletId, isReceiverDetailsSuccess]);

  useEffect(() => {
    if (selectedWalletId && receiverDetails?.wallets) {
      setSelectedWallet(receiverDetails.wallets.find((w) => w.id === selectedWalletId));
    }
  }, [selectedWalletId, receiverDetails]);

  useEffect(() => {
    return () => {
      if (isInvitationRetrySuccess || isInvitationRetryError) {
        resetInvitationRetry();
      }
      if (isUnregisterWalletSuccess || isUnregisterWalletError) {
        resetUnregisterWallet();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isInvitationRetryError,
    isInvitationRetrySuccess,
    isUnregisterWalletError,
    isUnregisterWalletSuccess,
  ]);

  useEffect(() => {
    if (isUnregisterWalletSuccess) {
      queryClient.invalidateQueries({
        queryKey: ["receivers", "receiver", receiverId],
      });
    }
  }, [isUnregisterWalletSuccess, queryClient, receiverId]);

  const showResetModal = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    event.preventDefault();
    resetUnregisterWallet();
    setIsResetModalVisible(true);
  };

  const hideResetModal = () => {
    setIsResetModalVisible(false);
    if (isUnregisterWalletError) {
      resetUnregisterWallet();
    }
  };

  const calculateRate = () => {
    if (!stats) return 0;
    const numerator = stats.paymentsSuccessfulCount;
    const denominator = stats.paymentsTotalCount;
    if (!denominator) return 0;
    return Number(numerator / denominator);
  };

  const setCardTemplateRows = (rows: number) => {
    return { "--StatCard-template-rows": rows } as React.CSSProperties;
  };

  const isRegistered = Boolean(selectedWallet?.stellarAddress);

  const renderActionButton = () => {
    if (isRegistered) {
      return (
        <Button
          variant="tertiary"
          size="md"
          onClick={showResetModal}
          isLoading={isUnregisterWalletPending}
        >
          Reset registration
        </Button>
      );
    }
    return (
      <Button
        variant="tertiary"
        size="md"
        onClick={(e) => {
          e.preventDefault();
          retryReceiverInvitation();
        }}
        isLoading={isInvitationRetryFetching}
      >
        Retry invitation message
      </Button>
    );
  };

  const renderInfoCards = () => {
    if (!receiverDetails) return null;

    return (
      <div className="StatCards StatCards--disbursementDetails">
        <Card>
          <div className="StatCards__card StatCards__card--grid">
            <div className="StatCards__card__item StatCards__card__item--fullWidth">
              <label className="StatCards__card__item__label">Total received</label>
              <div className="StatCards__card__item__value">
                <AssetAmount
                  amount={receiverDetails.totalReceived}
                  assetCode={receiverDetails.assetCode}
                  fallback="-"
                />
              </div>
            </div>

            <div className="StatCards__card__item StatCards__card__item--fullWidth">
              <label className="StatCards__card__item__label">Org ID</label>
              <div className="StatCards__card__item__value">{receiverDetails.orgId || "-"}</div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="StatCards__card StatCards__card--grid StatCards__card--wideGap">
            <div className="StatCards__card__column" style={{ ...setCardTemplateRows(1), marginTop: 0 }}>
              <div>
                <div className="StatCards__card__title">
                  <InfoTooltip infoText="The percentage of payments completed successfully (pending payments are not counted as successful)">
                    Successful payment rate
                  </InfoTooltip>
                </div>
                <div className="StatCards__card__unit">{`${percent.format(calculateRate())}`}</div>
              </div>
            </div>

            <div className="StatCards__card__column" style={setCardTemplateRows(4)}>
              <div className="StatCards__card__item StatCards__card__item--inline">
                <label className="StatCards__card__item__label">Total payments</label>
                <div className="StatCards__card__item__value">
                  {renderNumberOrDash(receiverDetails.stats.paymentsTotalCount)}
                </div>
              </div>
              <div className="StatCards__card__item StatCards__card__item--inline">
                <label className="StatCards__card__item__label">Successful payments</label>
                <div className="StatCards__card__item__value">
                  {renderNumberOrDash(receiverDetails.stats.paymentsSuccessfulCount)}
                </div>
              </div>
              <div className="StatCards__card__item StatCards__card__item--inline">
                <label className="StatCards__card__item__label">Failed payments</label>
                <div className="StatCards__card__item__value">
                  {renderNumberOrDash(receiverDetails.stats.paymentsFailedCount)}
                </div>
              </div>
              <div className="StatCards__card__item StatCards__card__item--inline">
                <label className="StatCards__card__item__label">Canceled payments</label>
                <div className="StatCards__card__item__value">
                  {renderNumberOrDash(receiverDetails.stats.paymentsCanceledCount)}
                </div>
              </div>
              <div className="StatCards__card__item StatCards__card__item--inline">
                <label className="StatCards__card__item__label">Remaining payments</label>
                <div className="StatCards__card__item__value">
                  {renderNumberOrDash(receiverDetails.stats.paymentsRemainingCount)}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  const renderRegistrationSection = () => {
    if (!receiverDetails) return null;

    const walletLabel = (w: ReceiverWallet) =>
      `${w.provider} — ${w.stellarAddress ? "Registered" : "Pending registration"}`;

    return (
      <div className="ReceiverDetails__wallets">
        {isInvitationRetrySuccess && (
          <NotificationWithButtons
            variant="success"
            title="Invitation sent successfully!"
            buttons={[{ label: "Dismiss", onClick: resetInvitationRetry }]}
          >
            {" "}
          </NotificationWithButtons>
        )}
        {invitationRetryError && (
          <NotificationWithButtons
            variant="error"
            title="Error"
            buttons={[{ label: "Dismiss", onClick: resetInvitationRetry }]}
          >
            <ErrorWithExtras appError={invitationRetryError} />
          </NotificationWithButtons>
        )}
        {isUnregisterWalletSuccess && (
          <NotificationWithButtons
            variant="success"
            title="Registration reset successfully!"
            buttons={[{ label: "Dismiss", onClick: resetUnregisterWallet }]}
          >
            The beneficiary can now re-register. Resend their invitation message below if needed.
          </NotificationWithButtons>
        )}
        {isUnregisterWalletError && (
          <NotificationWithButtons
            variant="error"
            title="Error resetting registration"
            buttons={[{ label: "Dismiss", onClick: resetUnregisterWallet }]}
          >
            <ErrorWithExtras appError={unregisterWalletError} />
          </NotificationWithButtons>
        )}

        <div className="ReceiverDetails__wallets__row">
          <div className="ReceiverDetails__wallets__dropdown">
            <Select
              fieldSize="sm"
              id="receiver-wallets"
              value={selectedWalletId}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                setSelectedWalletId(event.currentTarget.value)
              }
            >
              {receiverDetails.wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {walletLabel(w)}
                </option>
              ))}
            </Select>
            <div className="ReceiverDetails__wallets__subtitle">
              {renderTextWithCount(receiverDetails.wallets.length, "record", "records")}
            </div>
          </div>

          <div>{renderActionButton()}</div>
        </div>

        {selectedWallet ? (
          <Card>
            <div
              className="StatCards__card StatCards__card--grid StatCards__card--wideGap"
              style={{ "--StatCard-grid-columns": 3 } as React.CSSProperties}
            >
              {/* Column one */}
              <div className="StatCards__card__column">
                <div className="StatCards__card__item StatCards__card__item--inline">
                  <label className="StatCards__card__item__label">Balance</label>
                  <div className="StatCards__card__item__value">
                    <ReceiverWalletBalance stellarAddress={selectedWallet.stellarAddress} />
                  </div>
                </div>
                <div className="StatCards__card__item StatCards__card__item--inline">
                  <label className="StatCards__card__item__label">Registration status</label>
                  <div className="StatCards__card__item__value">
                    {isRegistered ? "Registered" : "Pending"}
                  </div>
                </div>
              </div>

              {/* Column two */}
              <div className="StatCards__card__column">
                <div className="StatCards__card__item StatCards__card__item--inline">
                  <label className="StatCards__card__item__label">Total payments received</label>
                  <div className="StatCards__card__item__value">
                    {renderNumberOrDash(selectedWallet.totalPaymentsCount)}
                  </div>
                </div>
                <div className="StatCards__card__item StatCards__card__item--inline">
                  <label className="StatCards__card__item__label">Total amount received</label>
                  <div className="StatCards__card__item__value">
                    <AssetAmount
                      amount={selectedWallet.totalAmountReceived}
                      assetCode={selectedWallet.assetCode}
                      fallback="-"
                    />
                  </div>
                </div>
              </div>

              {/* Column three */}
              <div className="StatCards__card__column">
                <div className="StatCards__card__item StatCards__card__item--inline">
                  <label className="StatCards__card__item__label">Registered at</label>
                  <div className="StatCards__card__item__value">
                    {formatDateTime(selectedWallet.createdAt)}
                  </div>
                </div>
                <div className="StatCards__card__item StatCards__card__item--inline">
                  <label className="StatCards__card__item__label">Invitation last sent</label>
                  <div className="StatCards__card__item__value">
                    {formatDateTime(selectedWallet.smsLastSentAt)}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    );
  };

  const renderContent = () => {
    if (isReceiverDetailsLoading) return <LoadingContent />;

    if (receiverDetailsError || !receiverDetails) {
      return (
        <Notification variant="error" title="Error" isFilled={true}>
          <ErrorWithExtras appError={receiverDetailsError || { message: GENERIC_ERROR_MESSAGE }} />
        </Notification>
      );
    }

    if (!receiverId || !receiverDetails.id) return null;

    return (
      <>
        <div className="DetailsSection">
          <SectionHeader>
            <SectionHeader.Row>
              <SectionHeader.Content>
                <Heading as="h2" size="sm">
                  {receiverDetails?.phoneNumber ? (
                    <CopyWithIcon textToCopy={receiverDetails.phoneNumber} iconSizeRem="1.5">
                      {receiverDetails.phoneNumber}
                    </CopyWithIcon>
                  ) : null}
                  {receiverDetails?.email ? (
                    <CopyWithIcon textToCopy={receiverDetails.email} iconSizeRem="1.5">
                      {receiverDetails.email}
                    </CopyWithIcon>
                  ) : null}
                </Heading>
              </SectionHeader.Content>
              <Button
                variant="tertiary"
                size="md"
                type="reset"
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`${Routes.RECEIVERS_EDIT}/${receiverId}`);
                }}
              >
                Edit receiver info
              </Button>
            </SectionHeader.Row>
          </SectionHeader>

          {renderInfoCards()}
        </div>

        <div className="DetailsSection">
          <SectionHeader>
            <SectionHeader.Row>
              <SectionHeader.Content>
                <Heading as="h3" size="xs">
                  Payment details
                </Heading>
              </SectionHeader.Content>
            </SectionHeader.Row>
          </SectionHeader>

          {renderRegistrationSection()}
        </div>

        <ReceiverPayments receiverId={receiverId} />
      </>
    );
  };

  return (
    <>
      <Breadcrumbs
        steps={[
          { label: "Receivers", route: Routes.RECEIVERS },
          { label: "Receiver details" },
        ]}
      />

      {renderContent()}

      <Modal visible={isResetModalVisible} onClose={hideResetModal}>
        <Modal.Heading>Reset beneficiary registration?</Modal.Heading>
        <Modal.Body>
          <p>
            This will allow the beneficiary to re-register. They will need to go through
            verification again before receiving further payments.
          </p>
          <p>You can resend their invitation message after resetting.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="tertiary"
            size="md"
            onClick={hideResetModal}
            isLoading={isUnregisterWalletPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="md"
            onClick={(event) => {
              event.preventDefault();
              if (selectedWallet?.id) {
                unregisterWallet({ receiverWalletId: selectedWallet.id, status: "READY" });
                setIsResetModalVisible(false);
              }
            }}
            isLoading={isUnregisterWalletPending}
          >
            Reset registration
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};
