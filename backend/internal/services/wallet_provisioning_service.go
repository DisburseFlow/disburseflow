package services

import (
	"context"
	"fmt"

	"github.com/stellar/go-stellar-sdk/support/log"

	"github.com/stellar/stellar-disbursement-platform-backend/internal/data"
)

// WalletProvisioningServiceInterface auto-creates and funds Stellar wallets,
// in the background, for phone-only registration receivers who don't have
// one yet.
type WalletProvisioningServiceInterface interface {
	ProvisionPendingWallets(ctx context.Context, batchSize int) error
}

// WalletProvisioningService drives wallet auto-provisioning out of band from
// the CSV upload request. Creating and funding a Stellar account per
// receiver involves multiple Horizon round trips, which is too slow to do
// synchronously inside the disbursement-creation HTTP request — this is
// called on a timer instead (see internal/scheduler/jobs/wallet_provisioning_job.go).
type WalletProvisioningService struct {
	Models            *data.Models
	WalletProvisioner data.WalletProvisioner
}

var _ WalletProvisioningServiceInterface = (*WalletProvisioningService)(nil)

func (s *WalletProvisioningService) validate() error {
	if s.Models == nil {
		return fmt.Errorf("WalletProvisioningService.Models cannot be nil")
	}
	if s.WalletProvisioner == nil {
		return fmt.Errorf("WalletProvisioningService.WalletProvisioner cannot be nil")
	}
	return nil
}

// ProvisionPendingWallets finds up to batchSize receiver_wallets for
// phone-only registration disbursements that don't have a Stellar address
// yet, provisions a wallet for each, and marks them Registered. Each
// receiver is handled independently — one failure doesn't stop the rest of
// the batch; it's simply retried on the next tick.
func (s *WalletProvisioningService) ProvisionPendingWallets(ctx context.Context, batchSize int) error {
	if err := s.validate(); err != nil {
		return fmt.Errorf("validating WalletProvisioningService: %w", err)
	}

	pending, err := s.Models.ReceiverWallet.GetUnprovisionedPhoneReceiverWallets(ctx, s.Models.DBConnectionPool, batchSize)
	if err != nil {
		return fmt.Errorf("getting unprovisioned phone receiver wallets: %w", err)
	}

	if len(pending) == 0 {
		return nil
	}

	log.Ctx(ctx).Infof("wallet provisioning job: found %d receiver wallet(s) awaiting a Stellar wallet", len(pending))

	for _, receiverWallet := range pending {
		asset := data.Asset{ID: receiverWallet.AssetID, Code: receiverWallet.AssetCode, Issuer: receiverWallet.AssetIssuer}

		stellarAddress, provisionErr := s.WalletProvisioner.ProvisionWallet(ctx, receiverWallet.PhoneNumber, asset)
		if provisionErr != nil {
			log.Ctx(ctx).Errorf("wallet provisioning job: failed to provision wallet for receiver_wallet=%s phone=%s: %v",
				receiverWallet.ReceiverWalletID, receiverWallet.PhoneNumber, provisionErr)
			continue
		}

		updateErr := s.Models.ReceiverWallet.Update(ctx, receiverWallet.ReceiverWalletID, data.ReceiverWalletUpdate{
			Status:         data.RegisteredReceiversWalletStatus,
			StellarAddress: stellarAddress,
		}, s.Models.DBConnectionPool)
		if updateErr != nil {
			log.Ctx(ctx).Errorf("wallet provisioning job: failed to persist provisioned wallet for receiver_wallet=%s: %v",
				receiverWallet.ReceiverWalletID, updateErr)
			continue
		}

		log.Ctx(ctx).Infof("wallet provisioning job: receiver_wallet=%s phone=%s now REGISTERED address=%s",
			receiverWallet.ReceiverWalletID, receiverWallet.PhoneNumber, stellarAddress)
	}

	return nil
}
