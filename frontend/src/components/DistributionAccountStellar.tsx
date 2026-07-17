import { useState } from "react";

import { Card, Heading, Icon, Link, Profile, Notification } from "@stellar/design-system";

import { AccountBalances } from "@/components/AccountBalances";
import { Box } from "@/components/Box";
import { BridgeIntegrationSection } from "@/components/BridgeIntegrationSection";
import { BridgeOptInModal } from "@/components/BridgeOptInModal";
import { ErrorWithExtras } from "@/components/ErrorWithExtras";
import { InfoTooltip } from "@/components/InfoTooltip";
import { KenyanBankIntegrationSection } from "@/components/KenyanBankIntegrationSection";
import { LoadingContent } from "@/components/LoadingContent";
import { SectionHeader } from "@/components/SectionHeader";
import { Title } from "@/components/Title";
import { WalletHistory } from "@/components/WalletHistory";
import { WalletTrustlines } from "@/components/WalletTrustlines";

import { STELLAR_EXPERT_URL } from "@/constants/envVariables";

import { useUpdateBridgeIntegration } from "@/apiQueries/useUpdateBridgeIntegration";

import { formatKes } from "@/helpers/formatKes";

import { useOrgAccountInfo } from "@/hooks/useOrgAccountInfo";
import { useRedux } from "@/hooks/useRedux";
import { useUsdToKesRate } from "@/hooks/useUsdToKesRate";

import { ShowForRoles } from "./ShowForRoles";

import { BridgeIntegrationUpdate } from "@/types";

export const DistributionAccountStellar = () => {
  const [isBridgeOptInModalVisible, setIsBridgeOptInModalVisible] = useState(false);

  const { organization } = useRedux("organization");
  const { distributionAccountPublicKey } = organization.data;

  const { balances, fetchAccountBalances } = useOrgAccountInfo(distributionAccountPublicKey);
  const { rate: usdToKesRate, isLoading: isRateLoading } = useUsdToKesRate();

  // USDC is treated 1:1 with USD for KES conversion purposes.
  const usdcBalance = balances?.find((b) => b.assetCode === "USDC");

  const {
    mutateAsync: updateBridgeIntegration,
    isPending: isBridgeUpdatePending,
    error: bridgeUpdateError,
    reset: resetBridgeUpdate,
  } = useUpdateBridgeIntegration();

  const handleBridgeOptIn = () => {
    setIsBridgeOptInModalVisible(true);
  };

  const handleBridgeOptInModalClose = () => {
    setIsBridgeOptInModalVisible(false);
    resetBridgeUpdate();
  };

  const handleBridgeOptInSubmit = async (data: BridgeIntegrationUpdate) => {
    try {
      const result = await updateBridgeIntegration(data);
      // Only close modal on success
      setIsBridgeOptInModalVisible(false);

      // Redirect to KYC link if available in the response
      if (result?.kyc_status?.kyc_link) {
        window.open(result.kyc_status.kyc_link, "_blank", "noopener,noreferrer");
      }
    } catch {
      // do nothing
    }
  };

  const handleCreateVirtualAccount = async () => {
    try {
      await updateBridgeIntegration({ status: "READY_FOR_DEPOSIT" });
    } catch {
      // Error is handled by the mutation hook
    }
  };

  const renderContent = () => {
    if (organization.status === "PENDING") {
      return <LoadingContent />;
    }

    if (organization.errorString) {
      return (
        <Notification variant="error" title="Error" isFilled={true}>
          <ErrorWithExtras
            appError={{
              message: organization.errorString,
              extras: organization.errorExtras,
            }}
          />
        </Notification>
      );
    }

    if (balances?.length === 0) {
      return <div className="Note">No account details available yet</div>;
    }

    return (
      <>
        <div>
          <Profile publicAddress={distributionAccountPublicKey} size="md" isCopy hideAvatar />
          <Box gap="xs" addlClassName="Note">
            <span>
              This is your account&rsquo;s underlying wallet address on the Stellar network. You
              generally won&rsquo;t need this — use the funding options above instead.
            </span>
            <span className="Note__emphasis">
              Note: For security and operational best practice, only fund this account when you're
              ready to send disbursements. Any authorized SDP user with disbursement permissions can
              initiate payments from this account.
            </span>
          </Box>
        </div>

        <div className="WalletBalances">
          <Title size="sm">Asset balances:</Title>
          <AccountBalances accountBalances={balances} />
        </div>
      </>
    );
  };

  return (
    <>
      <SectionHeader>
        <SectionHeader.Row>
          <SectionHeader.Content>
            <Heading as="h2" size="sm">
              Fund Account
            </Heading>
          </SectionHeader.Content>
        </SectionHeader.Row>
      </SectionHeader>

      <div className="CardStack">
        <Card>
          <div className="CardStack__card">
            <div className="CardStack__title">Account balance</div>
            {usdcBalance ? (
              <Box gap="xs">
                <Title size="lg">
                  {isRateLoading || !usdToKesRate
                    ? "Loading…"
                    : formatKes(usdcBalance.balance, usdToKesRate)}
                </Title>
                <span className="Note">Updates in real time as deposits arrive</span>
              </Box>
            ) : (
              <div className="Note">No balance yet. Fund your account below to get started.</div>
            )}
          </div>
        </Card>

        <KenyanBankIntegrationSection />

        <ShowForRoles acceptedRoles={["owner", "financial_controller"]}>
          <BridgeIntegrationSection
            onOptIn={handleBridgeOptIn}
            onCreateVirtualAccount={handleCreateVirtualAccount}
          />
        </ShowForRoles>

        <details className="CardStack__technicalDetails">
          <summary>Technical details</summary>

          <Card>
            <div className="CardStack__card">
              <div className="CardStack__title">
                <InfoTooltip infoText="The Stellar wallet address of the source of funds for your organization's payments">
                  Account address
                </InfoTooltip>
              </div>

              {renderContent()}
            </div>
          </Card>

          {/* TODO: hard-coded to a single wallet, figure out how to handle multiple */}
          <WalletTrustlines
            balances={balances || undefined}
            onSuccess={() => {
              fetchAccountBalances();
            }}
          />

          <Card>
            <div className="CardStack__card">
              <div className="CardStack__title">
                <Box gap="xs" direction="row" align="center">
                  <InfoTooltip infoText="A record of payments to and from your account, sourced directly from the Stellar network">
                    Wallet history
                  </InfoTooltip>
                  <Link href={`${STELLAR_EXPERT_URL}/account/${distributionAccountPublicKey}`}>
                    <Icon.LinkExternal01 className="ExternalLinkIcon" />
                  </Link>
                </Box>
              </div>
              <WalletHistory stellarAddress={distributionAccountPublicKey} />
            </div>
          </Card>
        </details>
      </div>

      <BridgeOptInModal
        visible={isBridgeOptInModalVisible}
        onClose={handleBridgeOptInModalClose}
        onSubmit={handleBridgeOptInSubmit}
        isLoading={isBridgeUpdatePending}
        error={bridgeUpdateError}
      />
    </>
  );
};
