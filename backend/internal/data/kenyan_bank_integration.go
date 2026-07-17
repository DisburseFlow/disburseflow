package data

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/stellar/stellar-disbursement-platform-backend/db"
)

type KenyanBankName string

const (
	KenyanBankEquity KenyanBankName = "EQUITY"
	KenyanBankKCB    KenyanBankName = "KCB"
)

type KenyanBankIntegrationStatus string

const (
	KenyanBankStatusNotConfigured KenyanBankIntegrationStatus = "NOT_CONFIGURED"
	KenyanBankStatusActive        KenyanBankIntegrationStatus = "ACTIVE"
	KenyanBankStatusSuspended     KenyanBankIntegrationStatus = "SUSPENDED"
)

type KenyanBankDepositStatus string

const (
	KenyanDepositReceived    KenyanBankDepositStatus = "RECEIVED"
	KenyanDepositPendingSwap KenyanBankDepositStatus = "PENDING_SWAP"
	KenyanDepositSwapped     KenyanBankDepositStatus = "SWAPPED"
	KenyanDepositFailed      KenyanBankDepositStatus = "FAILED"
)

// KenyanBankIntegration is the per-bank configuration record.
type KenyanBankIntegration struct {
	ID             string                      `db:"id"`
	Bank           KenyanBankName              `db:"bank"`
	Status         KenyanBankIntegrationStatus `db:"status"`
	PaybillNumber  *string                     `db:"paybill_number"`
	AccountNumber  *string                     `db:"account_number"`
	WebhookSecret  *string                     `db:"webhook_secret"`
	ActivatedBy    *string                     `db:"activated_by"`
	ActivatedAt    *time.Time                  `db:"activated_at"`
	ErrorMessage   *string                     `db:"error_message"`
	CreatedAt      time.Time                   `db:"created_at"`
	UpdatedAt      time.Time                   `db:"updated_at"`
}

// KenyanBankDeposit records a single inbound KES credit from the bank.
type KenyanBankDeposit struct {
	ID              string                  `db:"id"`
	Bank            KenyanBankName          `db:"bank"`
	XMLMessageID    string                  `db:"xml_message_id"`
	KESAmount       float64                 `db:"kes_amount"`
	USDCAmount      *float64                `db:"usdc_amount"`
	KESToUSDRate    *float64                `db:"kes_to_usd_rate"`
	SenderName      *string                 `db:"sender_name"`
	SenderAccount   *string                 `db:"sender_account"`
	SenderBank      *string                 `db:"sender_bank"`
	Narration       *string                 `db:"narration"`
	ReferenceNumber *string                 `db:"reference_number"`
	Status          KenyanBankDepositStatus `db:"status"`
	StellarTxHash   *string                 `db:"stellar_tx_hash"`
	ReceivedAt      time.Time               `db:"received_at"`
	ConvertedAt     *time.Time              `db:"converted_at"`
	ErrorMessage    *string                 `db:"error_message"`
}

var kenyanBankIntegrationColumns = strings.Join([]string{
	"id", "bank", "status", "paybill_number", "account_number",
	"webhook_secret", "activated_by", "activated_at",
	"error_message", "created_at", "updated_at",
}, ", ")

var kenyanBankDepositColumns = strings.Join([]string{
	"id", "bank", "xml_message_id", "kes_amount", "usdc_amount",
	"kes_to_usd_rate", "sender_name", "sender_account", "sender_bank",
	"narration", "reference_number", "status",
	"stellar_tx_hash", "received_at", "converted_at", "error_message",
}, ", ")

// KenyanBankIntegrationModel provides DB access for Kenyan bank integration.
type KenyanBankIntegrationModel struct {
	dbConnectionPool db.DBConnectionPool
}

// GetAll returns all configured bank integrations.
func (m *KenyanBankIntegrationModel) GetAll(ctx context.Context) ([]*KenyanBankIntegration, error) {
	query := fmt.Sprintf(`SELECT %s FROM kenyan_bank_integration ORDER BY bank`, kenyanBankIntegrationColumns)

	var rows []*KenyanBankIntegration
	if err := m.dbConnectionPool.SelectContext(ctx, &rows, query); err != nil {
		return nil, fmt.Errorf("listing kenyan bank integrations: %w", err)
	}
	return rows, nil
}

// GetByBank retrieves the integration record for a specific bank.
func (m *KenyanBankIntegrationModel) GetByBank(ctx context.Context, bank KenyanBankName) (*KenyanBankIntegration, error) {
	query := fmt.Sprintf(`SELECT %s FROM kenyan_bank_integration WHERE bank = $1`, kenyanBankIntegrationColumns)

	var row KenyanBankIntegration
	if err := m.dbConnectionPool.GetContext(ctx, &row, query, bank); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrRecordNotFound
		}
		return nil, fmt.Errorf("getting kenyan bank integration for %s: %w", bank, err)
	}
	return &row, nil
}

type KenyanBankIntegrationUpsert struct {
	Bank          KenyanBankName
	Status        KenyanBankIntegrationStatus
	PaybillNumber *string
	AccountNumber *string
	WebhookSecret *string
	ActivatedBy   *string
	ErrorMessage  *string
}

// Upsert creates or updates the integration record for a bank.
func (m *KenyanBankIntegrationModel) Upsert(ctx context.Context, u KenyanBankIntegrationUpsert) (*KenyanBankIntegration, error) {
	var activatedAt *time.Time
	if u.Status == KenyanBankStatusActive {
		t := time.Now()
		activatedAt = &t
	}

	query := fmt.Sprintf(`
		INSERT INTO kenyan_bank_integration
			(bank, status, paybill_number, account_number, webhook_secret, activated_by, activated_at, error_message)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (bank) DO UPDATE SET
			status         = EXCLUDED.status,
			paybill_number = COALESCE(EXCLUDED.paybill_number, kenyan_bank_integration.paybill_number),
			account_number = COALESCE(EXCLUDED.account_number, kenyan_bank_integration.account_number),
			webhook_secret = COALESCE(EXCLUDED.webhook_secret, kenyan_bank_integration.webhook_secret),
			activated_by   = COALESCE(EXCLUDED.activated_by,   kenyan_bank_integration.activated_by),
			activated_at   = COALESCE(EXCLUDED.activated_at,   kenyan_bank_integration.activated_at),
			error_message  = EXCLUDED.error_message,
			updated_at     = NOW()
		RETURNING %s`, kenyanBankIntegrationColumns)

	var row KenyanBankIntegration
	err := m.dbConnectionPool.GetContext(ctx, &row, query,
		u.Bank, u.Status, u.PaybillNumber, u.AccountNumber,
		u.WebhookSecret, u.ActivatedBy, activatedAt, u.ErrorMessage,
	)
	if err != nil {
		return nil, fmt.Errorf("upserting kenyan bank integration: %w", err)
	}
	return &row, nil
}

// InsertDeposit records an inbound KES credit.
func (m *KenyanBankIntegrationModel) InsertDeposit(ctx context.Context, d KenyanBankDeposit) (*KenyanBankDeposit, error) {
	query := fmt.Sprintf(`
		INSERT INTO kenyan_bank_deposits
			(bank, xml_message_id, kes_amount, sender_name, sender_account, sender_bank, narration, reference_number)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (xml_message_id) DO NOTHING
		RETURNING %s`, kenyanBankDepositColumns)

	var row KenyanBankDeposit
	err := m.dbConnectionPool.GetContext(ctx, &row, query,
		d.Bank, d.XMLMessageID, d.KESAmount,
		d.SenderName, d.SenderAccount, d.SenderBank,
		d.Narration, d.ReferenceNumber,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrRecordAlreadyExists
		}
		return nil, fmt.Errorf("inserting kenyan bank deposit: %w", err)
	}
	return &row, nil
}

// UpdateDepositSwapped marks a deposit as successfully converted to USDC.
func (m *KenyanBankIntegrationModel) UpdateDepositSwapped(ctx context.Context, id string, usdcAmount float64, rate float64, txHash string) error {
	now := time.Now()
	_, err := m.dbConnectionPool.ExecContext(ctx, `
		UPDATE kenyan_bank_deposits
		SET status = $1, usdc_amount = $2, kes_to_usd_rate = $3, stellar_tx_hash = $4, converted_at = $5, updated_at = NOW()
		WHERE id = $6`,
		KenyanDepositSwapped, usdcAmount, rate, txHash, now, id,
	)
	if err != nil {
		return fmt.Errorf("marking deposit %s as swapped: %w", id, err)
	}
	return nil
}

// UpdateDepositFailed marks a deposit as failed with an error message.
func (m *KenyanBankIntegrationModel) UpdateDepositFailed(ctx context.Context, id, errMsg string) error {
	_, err := m.dbConnectionPool.ExecContext(ctx, `
		UPDATE kenyan_bank_deposits
		SET status = $1, error_message = $2, updated_at = NOW()
		WHERE id = $3`,
		KenyanDepositFailed, errMsg, id,
	)
	if err != nil {
		return fmt.Errorf("marking deposit %s as failed: %w", id, err)
	}
	return nil
}

// ListDeposits returns the most recent deposits across all banks, newest first.
func (m *KenyanBankIntegrationModel) ListDeposits(ctx context.Context, limit int) ([]*KenyanBankDeposit, error) {
	if limit <= 0 {
		limit = 50
	}
	query := fmt.Sprintf(`
		SELECT %s FROM kenyan_bank_deposits
		ORDER BY received_at DESC
		LIMIT $1`, kenyanBankDepositColumns)

	var rows []*KenyanBankDeposit
	if err := m.dbConnectionPool.SelectContext(ctx, &rows, query, limit); err != nil {
		return nil, fmt.Errorf("listing kenyan bank deposits: %w", err)
	}
	return rows, nil
}
