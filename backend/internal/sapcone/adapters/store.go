package adapters

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/lib/pq"

	"github.com/stellar/stellar-disbursement-platform-backend/db"
	"github.com/stellar/stellar-disbursement-platform-backend/internal/sapcone"
	"github.com/stellar/stellar-disbursement-platform-backend/internal/utils"
)

// PostgresParticipantWalletStore is the Postgres-backed implementation of
// sapcone.ParticipantWalletStore. Stellar secret keys are encrypted at rest
// using encryptionPassphrase and are never logged.
type PostgresParticipantWalletStore struct {
	dbConnectionPool     db.DBConnectionPool
	encrypter            utils.PrivateKeyEncrypter
	encryptionPassphrase string
}

// NewPostgresParticipantWalletStore creates a store backed by dbConnectionPool.
// encryptionPassphrase is used to encrypt/decrypt each wallet's Stellar seed at rest.
func NewPostgresParticipantWalletStore(dbConnectionPool db.DBConnectionPool, encryptionPassphrase string) *PostgresParticipantWalletStore {
	return &PostgresParticipantWalletStore{
		dbConnectionPool:     dbConnectionPool,
		encrypter:            &utils.DefaultPrivateKeyEncrypter{},
		encryptionPassphrase: encryptionPassphrase,
	}
}

const participantWalletColumns = "id, phone_number, stellar_address, stellar_seed, status, failure_reason, created_at, updated_at"

type participantWalletRow struct {
	ID             string                            `db:"id"`
	PhoneNumber    string                            `db:"phone_number"`
	StellarAddress string                            `db:"stellar_address"`
	StellarSeed    string                            `db:"stellar_seed"`
	Status         sapcone.ParticipantWalletStatus   `db:"status"`
	FailureReason  sapcone.ProvisioningFailureReason `db:"failure_reason"`
	CreatedAt      time.Time                         `db:"created_at"`
	UpdatedAt      time.Time                         `db:"updated_at"`
}

func (s *PostgresParticipantWalletStore) toDomain(row *participantWalletRow) (*sapcone.ParticipantWallet, error) {
	seed := row.StellarSeed
	if seed != "" {
		decrypted, err := s.encrypter.Decrypt(seed, s.encryptionPassphrase)
		if err != nil {
			return nil, fmt.Errorf("decrypting stellar seed for wallet %s: %w", row.ID, err)
		}
		seed = decrypted
	}

	return &sapcone.ParticipantWallet{
		ID:             row.ID,
		PhoneNumber:    row.PhoneNumber,
		StellarAddress: row.StellarAddress,
		StellarSeed:    seed,
		Status:         row.Status,
		FailureReason:  row.FailureReason,
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
	}, nil
}

// GetByPhoneNumber returns the wallet record for phoneNumber, or
// sapcone.ErrParticipantNotFound if no record exists.
func (s *PostgresParticipantWalletStore) GetByPhoneNumber(ctx context.Context, phoneNumber string) (*sapcone.ParticipantWallet, error) {
	var row participantWalletRow
	query := fmt.Sprintf(`SELECT %s FROM participant_wallets WHERE phone_number = $1`, participantWalletColumns)
	if err := s.dbConnectionPool.GetContext(ctx, &row, query, phoneNumber); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, sapcone.ErrParticipantNotFound
		}
		return nil, fmt.Errorf("querying participant wallet by phone number: %w", err)
	}
	return s.toDomain(&row)
}

// Create inserts a new wallet record in Pending status.
// Returns sapcone.ErrParticipantAlreadyExists if phoneNumber is already present.
func (s *PostgresParticipantWalletStore) Create(ctx context.Context, phoneNumber string) (*sapcone.ParticipantWallet, error) {
	var row participantWalletRow
	query := fmt.Sprintf(`
		INSERT INTO participant_wallets (phone_number, status)
		VALUES ($1, $2)
		RETURNING %s
	`, participantWalletColumns)
	err := s.dbConnectionPool.GetContext(ctx, &row, query, phoneNumber, sapcone.ParticipantWalletStatusPending)
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" {
			return nil, sapcone.ErrParticipantAlreadyExists
		}
		return nil, fmt.Errorf("inserting participant wallet: %w", err)
	}
	return s.toDomain(&row)
}

// UpdateStatus persists a status transition and, optionally, a failure reason.
func (s *PostgresParticipantWalletStore) UpdateStatus(ctx context.Context, id string, status sapcone.ParticipantWalletStatus, reason sapcone.ProvisioningFailureReason) error {
	query := `UPDATE participant_wallets SET status = $1, failure_reason = $2 WHERE id = $3`
	result, err := s.dbConnectionPool.ExecContext(ctx, query, status, reason, id)
	if err != nil {
		return fmt.Errorf("updating participant wallet status: %w", err)
	}
	return checkRowsAffected(result, id)
}

// UpdateStellarAddress records the generated public key after the on-chain account is created.
func (s *PostgresParticipantWalletStore) UpdateStellarAddress(ctx context.Context, id string, stellarAddress string) error {
	query := `UPDATE participant_wallets SET stellar_address = $1 WHERE id = $2`
	result, err := s.dbConnectionPool.ExecContext(ctx, query, stellarAddress, id)
	if err != nil {
		return fmt.Errorf("updating participant wallet stellar address: %w", err)
	}
	return checkRowsAffected(result, id)
}

// UpdateStellarSeed encrypts and persists the wallet's Stellar secret seed.
func (s *PostgresParticipantWalletStore) UpdateStellarSeed(ctx context.Context, id string, stellarSeed string) error {
	encrypted, err := s.encrypter.Encrypt(stellarSeed, s.encryptionPassphrase)
	if err != nil {
		return fmt.Errorf("encrypting stellar seed: %w", err)
	}
	query := `UPDATE participant_wallets SET stellar_seed = $1 WHERE id = $2`
	result, err := s.dbConnectionPool.ExecContext(ctx, query, encrypted, id)
	if err != nil {
		return fmt.Errorf("updating participant wallet stellar seed: %w", err)
	}
	return checkRowsAffected(result, id)
}

func checkRowsAffected(result sql.Result, id string) error {
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("getting rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("participant wallet %s: %w", id, sapcone.ErrParticipantNotFound)
	}
	return nil
}

var _ sapcone.ParticipantWalletStore = (*PostgresParticipantWalletStore)(nil)
