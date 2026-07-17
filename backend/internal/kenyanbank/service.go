package kenyanbank

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/stellar/go-stellar-sdk/support/log"

	"github.com/stellar/stellar-disbursement-platform-backend/internal/data"
)

// ServiceInterface is the public API for the Kenyan bank integration.
type ServiceInterface interface {
	// GetIntegrations returns all configured bank integrations.
	GetIntegrations(ctx context.Context) ([]*data.KenyanBankIntegration, error)

	// Activate sets up the integration for a specific bank and marks it ACTIVE.
	Activate(ctx context.Context, bank data.KenyanBankName, activatedBy string) (*data.KenyanBankIntegration, error)

	// Suspend marks an integration as SUSPENDED.
	Suspend(ctx context.Context, bank data.KenyanBankName) (*data.KenyanBankIntegration, error)

	// HandleWebhook parses and records an inbound XML credit advice.
	// It returns the persisted deposit record.
	HandleWebhook(ctx context.Context, bank data.KenyanBankName, xmlPayload []byte) (*data.KenyanBankDeposit, error)

	// ListDeposits returns the most recent inbound deposits.
	ListDeposits(ctx context.Context, limit int) ([]*data.KenyanBankDeposit, error)
}

// Service implements ServiceInterface.
type Service struct {
	Model *data.KenyanBankIntegrationModel
	// FXRateURL is the endpoint used to fetch a live USD→KES rate for
	// computing the USDC equivalent of each KES deposit.
	// Defaults to open.er-api.com if empty.
	FXRateURL string
}

// Configured paybill and account numbers per bank.
// In production these would live in the DB or env config.
var bankAccountConfig = map[data.KenyanBankName]struct {
	Paybill string
	Account string
}{
	data.KenyanBankEquity: {Paybill: "247247", Account: "0720000001"},
	data.KenyanBankKCB:    {Paybill: "522522", Account: "1234567890"},
}

// GetIntegrations returns all configured bank integrations.
func (s *Service) GetIntegrations(ctx context.Context) ([]*data.KenyanBankIntegration, error) {
	rows, err := s.Model.GetAll(ctx)
	if err != nil {
		return nil, err
	}

	// Seed missing rows so the frontend always has both banks.
	configured := map[data.KenyanBankName]bool{}
	for _, r := range rows {
		configured[r.Bank] = true
	}
	for _, bank := range []data.KenyanBankName{data.KenyanBankEquity, data.KenyanBankKCB} {
		if !configured[bank] {
			cfg := bankAccountConfig[bank]
			pbill := cfg.Paybill
			acct := cfg.Account
			row, err := s.Model.Upsert(ctx, data.KenyanBankIntegrationUpsert{
				Bank:          bank,
				Status:        data.KenyanBankStatusNotConfigured,
				PaybillNumber: &pbill,
				AccountNumber: &acct,
			})
			if err != nil {
				return nil, fmt.Errorf("seeding bank %s: %w", bank, err)
			}
			rows = append(rows, row)
		}
	}
	return rows, nil
}

// Activate marks the given bank as ACTIVE.
func (s *Service) Activate(ctx context.Context, bank data.KenyanBankName, activatedBy string) (*data.KenyanBankIntegration, error) {
	cfg, ok := bankAccountConfig[bank]
	if !ok {
		return nil, fmt.Errorf("unsupported bank %s", bank)
	}
	pbill := cfg.Paybill
	acct := cfg.Account
	return s.Model.Upsert(ctx, data.KenyanBankIntegrationUpsert{
		Bank:          bank,
		Status:        data.KenyanBankStatusActive,
		PaybillNumber: &pbill,
		AccountNumber: &acct,
		ActivatedBy:   &activatedBy,
	})
}

// Suspend marks the given bank as SUSPENDED.
func (s *Service) Suspend(ctx context.Context, bank data.KenyanBankName) (*data.KenyanBankIntegration, error) {
	return s.Model.Upsert(ctx, data.KenyanBankIntegrationUpsert{
		Bank:   bank,
		Status: data.KenyanBankStatusSuspended,
	})
}

// HandleWebhook parses an inbound XML credit advice, persists the deposit,
// fetches a live KES→USD rate, computes the USDC equivalent, and marks the
// deposit PENDING_SWAP.
//
// Actual on-chain USDC settlement (Stellar path payment / custodian call) is
// delegated to a separate async job that watches for PENDING_SWAP records;
// this keeps the webhook handler synchronous and fast.
func (s *Service) HandleWebhook(ctx context.Context, bank data.KenyanBankName, xmlPayload []byte) (*data.KenyanBankDeposit, error) {
	advice, err := ParseCreditAdvice(xmlPayload)
	if err != nil {
		return nil, fmt.Errorf("parsing XML credit advice: %w", err)
	}

	if strings.ToUpper(advice.Currency) != "KES" {
		return nil, fmt.Errorf("unexpected currency %s, expected KES", advice.Currency)
	}

	deposit := data.KenyanBankDeposit{
		Bank:         bank,
		XMLMessageID: advice.MessageID,
		KESAmount:    advice.Amount,
		Status:       data.KenyanDepositReceived,
	}
	if advice.SenderName != "" {
		deposit.SenderName = &advice.SenderName
	}
	if advice.SenderAccount != "" {
		deposit.SenderAccount = &advice.SenderAccount
	}
	if advice.SenderBank != "" {
		deposit.SenderBank = &advice.SenderBank
	}
	if advice.Narration != "" {
		deposit.Narration = &advice.Narration
	}
	if advice.ReferenceNumber != "" {
		deposit.ReferenceNumber = &advice.ReferenceNumber
	}

	saved, err := s.Model.InsertDeposit(ctx, deposit)
	if err != nil {
		return nil, fmt.Errorf("recording deposit: %w", err)
	}

	// Fetch live KES→USD rate and compute USDC equivalent.
	rate, rateErr := s.fetchKEStoUSDRate(ctx)
	if rateErr != nil {
		log.Ctx(ctx).Warnf("kenyanbank: could not fetch live FX rate: %v — deposit %s left as RECEIVED", rateErr, saved.ID)
		return saved, nil
	}

	usdcAmount := roundUSDC(advice.Amount / rate)
	if err := s.Model.UpdateDepositSwapped(ctx, saved.ID, usdcAmount, rate, ""); err != nil {
		log.Ctx(ctx).Warnf("kenyanbank: failed marking deposit %s PENDING_SWAP: %v", saved.ID, err)
	}

	saved.USDCAmount = &usdcAmount
	saved.KESToUSDRate = &rate
	saved.Status = data.KenyanDepositSwapped
	return saved, nil
}

// ListDeposits returns the most recent deposits.
func (s *Service) ListDeposits(ctx context.Context, limit int) ([]*data.KenyanBankDeposit, error) {
	return s.Model.ListDeposits(ctx, limit)
}

// fetchKEStoUSDRate fetches the live KES/USD exchange rate.
func (s *Service) fetchKEStoUSDRate(ctx context.Context) (float64, error) {
	url := s.FXRateURL
	if url == "" {
		url = "https://open.er-api.com/v6/latest/USD"
	}

	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}

	var result struct {
		Rates map[string]float64 `json:"rates"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return 0, err
	}

	rate, ok := result.Rates["KES"]
	if !ok || rate == 0 {
		return 0, fmt.Errorf("KES rate not found in FX response")
	}
	return rate, nil
}

func roundUSDC(v float64) float64 {
	return math.Round(v*10_000_000) / 10_000_000
}
