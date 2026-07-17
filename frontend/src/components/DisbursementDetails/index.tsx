import { useEffect } from "react";

import { BigNumber } from "bignumber.js";

import { Card, Input, Notification } from "@stellar/design-system";

import { AssetAmount } from "@/components/AssetAmount";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Title } from "@/components/Title";

import { useAssetsByWallet } from "@/apiQueries/useAssetsByWallet";
import { useRegistrationContactTypes } from "@/apiQueries/useRegistrationContactTypes";
import { useVerificationTypes } from "@/apiQueries/useVerificationTypes";
import { useWallets } from "@/apiQueries/useWallets";

import { formatRegistrationContactType } from "@/helpers/formatRegistrationContactType";
import { formatUploadedFileDisplayName } from "@/helpers/formatUploadedFileDisplayName";

import { useAllBalances } from "@/hooks/useAllBalances";

import {
  AccountBalanceItem,
  ApiAsset,
  Disbursement,
  DisbursementStep,
  hasWallet,
  NONE_VERIFICATION_VALUE,
  RegistrationContactType,
  VerificationFieldMap,
} from "@/types";

import "./styles.scss";

// Every disbursement amount shown in this flow is run through AssetAmount,
// which always converts to KES (see helpers/kesRates.ts) — so the "Currency"
// label should always say KES too, regardless of the underlying on-chain
// asset. Keying this off asset code (as before) let the label drift out of
// sync with what was actually displayed.
const CURRENCY_DISPLAY_LABEL = "Kenyan Shilling (KES)";

const SDP_EMBEDDED_WALLET_NAME = "embedded wallet";

const isSdpEmbeddedWallet = (walletName: string): boolean =>
  walletName.trim().toLowerCase() === SDP_EMBEDDED_WALLET_NAME;

// Disbursement creation is fixed to a single configuration: phone-based
// registration (wallets are auto-provisioned by the backend, no SEP-24 flow),
// the Demo Wallet provider, XLM as the on-chain asset (shown to admins as
// KES), and National ID as the verification field. The admin only names the
// disbursement and uploads a CSV.
const FIXED_REGISTRATION_CONTACT_TYPE: RegistrationContactType = "PHONE_NUMBER";
const FIXED_WALLET_NAME = "demo wallet";
const FIXED_ASSET_CODE = "XLM";
const FIXED_VERIFICATION_FIELD = "NATIONAL_ID_NUMBER";

interface DisbursementDetailsProps {
  variant: DisbursementStep;
  details?: Disbursement;
  futureBalance?: number;
  csvFile?: File;
  onChange?: (state: Disbursement) => void;
  onValidate?: (isValid: boolean) => void;
}

const initDetails: Disbursement = {
  id: "",
  name: "",
  registrationContactType: undefined,
  asset: {
    id: "",
    code: "",
  },
  wallet: {
    id: "",
    name: "",
  },
  verificationField: "",
  createdAt: "",
  status: "DRAFT",
  statusHistory: [],
  receiverRegistrationMessageTemplate: "",
  stats: undefined,
};

const isDisbursementValid = (inputs: Disbursement): boolean => {
  if (!inputs.name) {
    return false;
  }

  if (!inputs.registrationContactType) {
    return false;
  }

  if (!inputs.asset.code) {
    return false;
  }

  if (!hasWallet(inputs.registrationContactType)) {
    if (!inputs.wallet.id || !inputs.verificationField) {
      return false;
    }
  }

  return true;
};

interface DerivedFormState {
  assetOptions: ApiAsset[];
  labels: {
    walletProvider: string;
    verification: string;
  };
}

interface DeriveFormStateArgs {
  details: Disbursement;
  walletAssets?: ApiAsset[];
  allBalances?: AccountBalanceItem[];
}

// Registration contact type is fixed to phone (see FIXED_REGISTRATION_CONTACT_TYPE),
// so the wallet-address / embedded-wallet branches this used to derive select
// options and disabled-state for are no longer reachable — this only computes
// what the read-only summary and the asset auto-select effect still need.
const deriveFormState = ({ details, walletAssets, allBalances }: DeriveFormStateArgs): DerivedFormState => {
  const isWalletAddressProvided = hasWallet(details.registrationContactType);
  const isEmbeddedWallet = isSdpEmbeddedWallet(details.wallet.name);

  const assetOptions = (walletAssets ?? []).filter((asset) => {
    if (asset.code === "XLM" && asset.issuer === "") {
      return true;
    }

    return !!allBalances?.find(
      (balance) => balance.assetCode === asset.code && balance.assetIssuer === asset.issuer,
    );
  });

  const labels = {
    walletProvider: details.wallet.name || "-",
    verification: details.verificationField
      ? VerificationFieldMap[details.verificationField] || details.verificationField
      : isWalletAddressProvided || isEmbeddedWallet
        ? NONE_VERIFICATION_VALUE
        : "-",
  };

  return { assetOptions, labels };
};

export const DisbursementDetails: React.FC<DisbursementDetailsProps> = ({
  variant,
  details = initDetails,
  futureBalance = 0,
  csvFile,
  onChange,
  onValidate,
}: DisbursementDetailsProps) => {
  const { data: wallets, error: walletsError, isLoading: isWalletsLoading } = useWallets({});
  const {
    data: registrationContactTypes,
    error: registrationContactTypesError,
    isLoading: areRegistrationContactTypesLoading,
  } = useRegistrationContactTypes();

  const {
    data: walletAssets,
    error: walletError,
    isFetching: isWalletAssetsFetching,
  } = useAssetsByWallet({
    walletId: details.wallet.id,
    registrationContactType: details.registrationContactType,
  });

  const {
    data: verificationTypes,
    error: verificationTypesError,
    isFetching: isVerificationTypesFetching,
  } = useVerificationTypes();

  const { allBalances } = useAllBalances();

  const derived = deriveFormState({ details, walletAssets, allBalances });

  const apiErrors = [
    registrationContactTypesError?.message,
    walletsError?.message,
    walletError?.message,
    verificationTypesError?.message,
  ]
    .filter(Boolean)
    .map(String);

  const updateDetails = (next: Partial<Disbursement>) => {
    const updatedDetails = {
      ...details,
      ...next,
    };

    onChange?.(updatedDetails);
    onValidate?.(isDisbursementValid(updatedDetails));
  };

  // Auto-fill the fixed configuration as each dependency loads: registration
  // contact type and verification field need no prerequisite; the wallet
  // needs registration contact type set first (it affects which wallets are
  // eligible); the asset needs the wallet set first (assets are fetched per
  // wallet). No Select inputs are rendered for these — see renderFormFields.
  useEffect(() => {
    const updates: Partial<Disbursement> = {};

    if (
      !details.registrationContactType &&
      registrationContactTypes?.includes(FIXED_REGISTRATION_CONTACT_TYPE)
    ) {
      updates.registrationContactType = FIXED_REGISTRATION_CONTACT_TYPE;
    }

    if (!details.wallet.id && details.registrationContactType && wallets?.length) {
      const demoWallet = wallets.find(
        (wallet) => wallet.enabled && wallet.name.trim().toLowerCase() === FIXED_WALLET_NAME,
      );
      if (demoWallet) {
        updates.wallet = { id: demoWallet.id, name: demoWallet.name };
      }
    }

    if (
      !details.verificationField &&
      verificationTypes?.includes(FIXED_VERIFICATION_FIELD as (typeof verificationTypes)[number])
    ) {
      updates.verificationField = FIXED_VERIFICATION_FIELD;
    }

    if (Object.keys(updates).length > 0) {
      updateDetails(updates);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    registrationContactTypes,
    wallets,
    verificationTypes,
    details.registrationContactType,
    details.wallet.id,
    details.verificationField,
  ]);

  useEffect(() => {
    if (!details.wallet.id || details.asset.id) {
      return;
    }

    const xlmAsset = derived.assetOptions.find((asset) => asset.code === FIXED_ASSET_CODE);
    if (xlmAsset) {
      updateDetails({ asset: { id: xlmAsset.id, code: xlmAsset.code } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details.wallet.id, details.asset.id, derived.assetOptions]);

  const fixedFieldsReady = Boolean(
    details.registrationContactType && details.wallet.id && details.asset.id && details.verificationField,
  );

  const isStillLoadingFixedFields =
    !fixedFieldsReady &&
    (areRegistrationContactTypesLoading ||
      isWalletsLoading ||
      isWalletAssetsFetching ||
      isVerificationTypesFetching);

  const demoWalletMissing =
    !isWalletsLoading && !details.wallet.id && details.registrationContactType && wallets
      ? !wallets.some(
          (wallet) => wallet.enabled && wallet.name.trim().toLowerCase() === FIXED_WALLET_NAME,
        )
      : false;

  const xlmAssetMissing =
    !isWalletAssetsFetching && details.wallet.id && !details.asset.id
      ? !derived.assetOptions.some((asset) => asset.code === FIXED_ASSET_CODE)
      : false;

  const handleNameChange = (value: string) => {
    updateDetails({ name: value });
  };

  const renderSummaryFields = () => (
    <>
      <div>
        <label className="Label Label--sm">Registration Contact Type</label>
        <div className="DisbursementDetailsFields__value">
          {formatRegistrationContactType(details.registrationContactType)}
        </div>
      </div>

      <div>
        <label className="Label Label--sm">Provider</label>
        <div className="DisbursementDetailsFields__value">{derived.labels.walletProvider}</div>
      </div>

      <div>
        <label className="Label Label--sm">Currency</label>
        <div className="DisbursementDetailsFields__value">{CURRENCY_DISPLAY_LABEL}</div>
      </div>

      <div>
        <label className="Label Label--sm">Verification Type</label>
        <div className="DisbursementDetailsFields__value">{derived.labels.verification}</div>
      </div>

      <div>
        <label className="Label Label--sm">Disbursement name</label>
        <div className="DisbursementDetailsFields__value">{details.name}</div>
      </div>

      <div>
        <label className="Label Label--sm">Future balance</label>
        <div
          className={`DisbursementDetailsFields__value ${
            BigNumber(futureBalance).gte(0) ? "" : "DisbursementDetailsFields__negative"
          }`}
        >
          <AssetAmount amount={futureBalance.toString()} assetCode={details.asset.code} />
        </div>
      </div>

      {variant === "confirmation" ? (
        <div>
          <label className="Label Label--sm">CSV</label>
          <div className="DisbursementDetailsFields__value">
            {csvFile ? formatUploadedFileDisplayName(csvFile) : ""}
          </div>
        </div>
      ) : null}
    </>
  );

  const renderFormFields = () => (
    <>
      {isStillLoadingFixedFields ? (
        <Notification variant="primary" title="Preparing disbursement defaults…">
          Setting up phone registration, the Demo Wallet provider, XLM, and National ID
          verification.
        </Notification>
      ) : null}

      {demoWalletMissing ? (
        <Notification variant="error" title="Demo Wallet not found" isFilled={true}>
          This disbursement flow requires a wallet provider named &quot;Demo Wallet&quot;. Ask an
          administrator to configure it under Wallet Providers.
        </Notification>
      ) : null}

      {xlmAssetMissing ? (
        <Notification variant="error" title="XLM not available" isFilled={true}>
          The Demo Wallet provider doesn&apos;t support XLM. Ask an administrator to enable it under
          Wallet Providers.
        </Notification>
      ) : null}

      <Input
        id="name"
        label="Disbursement name"
        fieldSize="sm"
        onChange={(event) => handleNameChange(event.target.value)}
        value={details.name}
      />
    </>
  );

  const renderContent = () => {
    if (variant === "preview" || variant === "confirmation") {
      return renderSummaryFields();
    }

    return renderFormFields();
  };

  return (
    <>
      {apiErrors.length ? (
        <Notification variant="error" title="Error" isFilled={true}>
          {apiErrors.map((errorMessage) => (
            <div key={`error-${errorMessage}`}>{errorMessage}</div>
          ))}
        </Notification>
      ) : null}

      <Card>
        <InfoTooltip infoText="Registration, wallet provider, currency, and verification are pre-configured for this disbursement flow. Just give it a unique name.">
          <Title size="md">Disbursement details</Title>
        </InfoTooltip>

        <div className="DisbursementDetailsFields__inputs">{renderContent()}</div>
      </Card>
    </>
  );
};
