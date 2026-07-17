package adapters

import (
	"context"
	"fmt"

	"github.com/stellar/go-stellar-sdk/clients/horizonclient"
	"github.com/stellar/go-stellar-sdk/support/log"

	"github.com/stellar/stellar-disbursement-platform-backend/db"
	"github.com/stellar/stellar-disbursement-platform-backend/internal/data"
	"github.com/stellar/stellar-disbursement-platform-backend/internal/sapcone"
	"github.com/stellar/stellar-disbursement-platform-backend/internal/transactionsubmission/engine/signing"
)

// Provisioner wires sapcone's domain services to the platform's Postgres
// database, Horizon client, and signing infrastructure. It implements
// data.WalletProvisioner: given a phone number, it returns the Stellar
// address of that participant's wallet, creating and funding a new one
// on-chain (using the current tenant's distribution account as treasury) the
// first time it's asked about that phone number, with no human interaction.
type Provisioner struct {
	Store               *PostgresParticipantWalletStore
	Horizon             horizonclient.ClientInterface
	SignerRouter        signing.SignerRouter
	DistAccountResolver signing.DistributionAccountResolver
	StartingBalance     string
}

// NewProvisioner creates a Provisioner. dbConnectionPool is the multi-tenant
// connection pool (the same one backing data.Models); encryptionPassphrase
// encrypts each new participant wallet's secret seed at rest.
func NewProvisioner(
	dbConnectionPool db.DBConnectionPool,
	horizon horizonclient.ClientInterface,
	signerRouter signing.SignerRouter,
	distAccountResolver signing.DistributionAccountResolver,
	encryptionPassphrase string,
) *Provisioner {
	return &Provisioner{
		Store:               NewPostgresParticipantWalletStore(dbConnectionPool, encryptionPassphrase),
		Horizon:             horizon,
		SignerRouter:        signerRouter,
		DistAccountResolver: distAccountResolver,
		StartingBalance:     sapcone.DefaultAccountStartingBalance,
	}
}

// ProvisionWallet returns the Stellar address for phoneNumber, auto-creating
// and funding a wallet (and establishing a trustline to asset) if one
// doesn't exist yet. The current tenant's distribution account (resolved
// from ctx) is used as the treasury that funds the new account. Safe to call
// repeatedly for the same phone number — already-provisioned wallets are a
// no-op that just returns the existing address.
func (p *Provisioner) ProvisionWallet(ctx context.Context, phoneNumber string, asset data.Asset) (string, error) {
	distAccount, err := p.DistAccountResolver.DistributionAccountFromContext(ctx)
	if err != nil {
		return "", fmt.Errorf("resolving distribution account: %w", err)
	}

	client := &SignerStellarClient{
		Horizon:         p.Horizon,
		SignerRouter:    p.SignerRouter,
		TreasuryAccount: distAccount,
	}

	provisioner := sapcone.NewProvisionerService(p.Store, client, sapcone.ProvisionerOptions{
		NetworkPassphrase: p.SignerRouter.NetworkPassphrase(),
		StartingBalance:   p.StartingBalance,
	})

	log.Ctx(ctx).Infof("sapcone: wallet creation started for phone=%s asset=%s:%s", phoneNumber, asset.Code, asset.Issuer)

	result, err := provisioner.Provision(ctx, phoneNumber, sapcone.ProvisioningAsset{Code: asset.Code, Issuer: asset.Issuer}, sapcone.TreasuryAccountInfo{
		PublicKey: distAccount.Address,
		// SignerStellarClient recognizes a signer string equal to the
		// treasury's own address as "sign this with SignerRouter" rather than
		// a literal seed — see its docstring.
		Seed: distAccount.Address,
	})
	if err != nil {
		log.Ctx(ctx).Errorf("sapcone: wallet creation failed for phone=%s: %v", phoneNumber, err)
		return "", fmt.Errorf("provisioning wallet for phone %s: %w", phoneNumber, err)
	}

	if result.AlreadyReady {
		log.Ctx(ctx).Infof("sapcone: wallet already exists for phone=%s address=%s", phoneNumber, result.StellarAddress)
	} else {
		log.Ctx(ctx).Infof("sapcone: wallet creation successful for phone=%s address=%s", phoneNumber, result.StellarAddress)
	}

	return result.StellarAddress, nil
}

var _ data.WalletProvisioner = (*Provisioner)(nil)
