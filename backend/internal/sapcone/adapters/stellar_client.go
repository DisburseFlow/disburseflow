package adapters

import (
	"context"
	"fmt"

	"github.com/stellar/go-stellar-sdk/clients/horizonclient"
	"github.com/stellar/go-stellar-sdk/keypair"
	"github.com/stellar/go-stellar-sdk/txnbuild"

	"github.com/stellar/stellar-disbursement-platform-backend/internal/sapcone"
	"github.com/stellar/stellar-disbursement-platform-backend/internal/transactionsubmission/engine/signing"
	tssUtils "github.com/stellar/stellar-disbursement-platform-backend/internal/transactionsubmission/utils"
	"github.com/stellar/stellar-disbursement-platform-backend/pkg/schema"
)

// SignerStellarClient implements sapcone.StellarClient on top of Horizon and
// the platform's existing SignerRouter. Signing the treasury side of a
// transaction is delegated to SignerRouter — which already knows how to sign
// for any distribution account type (env-based or DB-vault-encrypted) — so
// this package never has to hold or handle the treasury's raw secret key.
//
// sapcone.ProvisionerService calls SubmitTransaction with a list of signer
// "seed" strings. This client treats a signer equal to TreasuryAccount.Address
// as a request to sign via SignerRouter with TreasuryAccount; any other
// string is treated as a literal Stellar secret seed. In practice that only
// ever happens for the freshly-generated participant keypair, which this
// package mints itself and holds only transiently in memory.
type SignerStellarClient struct {
	Horizon         horizonclient.ClientInterface
	SignerRouter    signing.SignerRouter
	TreasuryAccount schema.TransactionAccount
}

var _ sapcone.StellarClient = (*SignerStellarClient)(nil)

// LoadAccount fetches the current sequence number and native balance for address.
func (c *SignerStellarClient) LoadAccount(ctx context.Context, address string) (sapcone.StellarAccount, error) {
	account, err := c.Horizon.AccountDetail(horizonclient.AccountRequest{AccountID: address})
	if err != nil {
		return sapcone.StellarAccount{}, fmt.Errorf("loading account %s: %w", address, tssUtils.NewHorizonErrorWrapper(err))
	}

	seq, err := account.GetSequenceNumber()
	if err != nil {
		return sapcone.StellarAccount{}, fmt.Errorf("getting sequence number for account %s: %w", address, err)
	}

	nativeBalance, err := account.GetNativeBalance()
	if err != nil {
		return sapcone.StellarAccount{}, fmt.Errorf("getting native balance for account %s: %w", address, err)
	}

	return sapcone.StellarAccount{
		Address:        account.AccountID,
		SequenceNumber: seq,
		NativeBalance:  nativeBalance,
	}, nil
}

// SubmitTransaction signs tx with the given signers and submits it to Horizon.
func (c *SignerStellarClient) SubmitTransaction(ctx context.Context, tx *txnbuild.Transaction, signers ...string) (sapcone.StellarTransactionResult, error) {
	signedTx, err := c.sign(ctx, tx, signers...)
	if err != nil {
		return sapcone.StellarTransactionResult{}, fmt.Errorf("signing transaction: %w", err)
	}

	resp, err := c.Horizon.SubmitTransactionWithOptions(signedTx, horizonclient.SubmitTxOpts{SkipMemoRequiredCheck: true})
	if err != nil {
		return sapcone.StellarTransactionResult{}, fmt.Errorf("submitting transaction: %w", tssUtils.NewHorizonErrorWrapper(err))
	}

	return sapcone.StellarTransactionResult{Hash: resp.Hash, Successful: resp.Successful}, nil
}

func (c *SignerStellarClient) sign(ctx context.Context, tx *txnbuild.Transaction, signers ...string) (*txnbuild.Transaction, error) {
	for _, signer := range signers {
		if signer == c.TreasuryAccount.Address {
			signed, err := c.SignerRouter.SignStellarTransaction(ctx, tx, c.TreasuryAccount)
			if err != nil {
				return nil, fmt.Errorf("signing with treasury account %s: %w", c.TreasuryAccount.Address, err)
			}
			tx = signed
			continue
		}

		kp, err := keypair.ParseFull(signer)
		if err != nil {
			return nil, fmt.Errorf("parsing signer seed: %w", err)
		}
		signed, err := tx.Sign(c.SignerRouter.NetworkPassphrase(), kp)
		if err != nil {
			return nil, fmt.Errorf("signing with generated keypair %s: %w", kp.Address(), err)
		}
		tx = signed
	}
	return tx, nil
}
