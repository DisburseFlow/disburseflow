package httphandler

import (
	"encoding/json"
	"io"
	"net/http"
	"slices"
	"strings"

	"github.com/stellar/go-stellar-sdk/support/render/httpjson"

	"github.com/stellar/stellar-disbursement-platform-backend/internal/data"
	"github.com/stellar/stellar-disbursement-platform-backend/internal/kenyanbank"
	"github.com/stellar/stellar-disbursement-platform-backend/internal/sdpcontext"
	"github.com/stellar/stellar-disbursement-platform-backend/internal/serve/httperror"
)

// KenyanBankHandler handles all Kenyan bank integration endpoints.
type KenyanBankHandler struct {
	Service kenyanbank.ServiceInterface
}

// ── GET /kenyan-bank-integration ─────────────────────────────────────────────

type kenyanBankGetResponse struct {
	Integrations []*data.KenyanBankIntegration `json:"integrations"`
	Deposits     []*data.KenyanBankDeposit     `json:"recent_deposits"`
}

func (h KenyanBankHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	integrations, err := h.Service.GetIntegrations(ctx)
	if err != nil {
		httperror.InternalError(ctx, "Failed to get Kenyan bank integrations", err, nil).Render(w)
		return
	}

	deposits, err := h.Service.ListDeposits(ctx, 20)
	if err != nil {
		httperror.InternalError(ctx, "Failed to list deposits", err, nil).Render(w)
		return
	}

	httpjson.RenderStatus(w, http.StatusOK, kenyanBankGetResponse{
		Integrations: integrations,
		Deposits:     deposits,
	}, httpjson.JSON)
}

// ── PATCH /kenyan-bank-integration ───────────────────────────────────────────

type kenyanBankPatchRequest struct {
	Bank   data.KenyanBankName         `json:"bank"`
	Status data.KenyanBankIntegrationStatus `json:"status"`
}

var validBanks = []data.KenyanBankName{data.KenyanBankEquity, data.KenyanBankKCB}
var validPatchBankStatuses = []data.KenyanBankIntegrationStatus{
	data.KenyanBankStatusActive,
	data.KenyanBankStatusSuspended,
}

func (h KenyanBankHandler) Patch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req kenyanBankPatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httperror.BadRequest("Invalid request body", err, nil).Render(w)
		return
	}

	if !slices.Contains(validBanks, req.Bank) {
		httperror.BadRequest("Invalid bank — must be EQUITY or KCB", nil, nil).Render(w)
		return
	}
	if !slices.Contains(validPatchBankStatuses, req.Status) {
		httperror.BadRequest("Invalid status — must be ACTIVE or SUSPENDED", nil, nil).Render(w)
		return
	}

	userID, err := sdpcontext.GetUserIDFromContext(ctx)
	if err != nil {
		httperror.Unauthorized("", err, nil).Render(w)
		return
	}

	var result *data.KenyanBankIntegration
	switch req.Status {
	case data.KenyanBankStatusActive:
		result, err = h.Service.Activate(ctx, req.Bank, userID)
	case data.KenyanBankStatusSuspended:
		result, err = h.Service.Suspend(ctx, req.Bank)
	}
	if err != nil {
		httperror.InternalError(ctx, "Failed to update Kenyan bank integration", err, nil).Render(w)
		return
	}

	httpjson.RenderStatus(w, http.StatusOK, result, httpjson.JSON)
}

// ── POST /kenyan-bank-integration/webhook ────────────────────────────────────

func (h KenyanBankHandler) Webhook(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Identify which bank sent the webhook from the X-Bank-Source header
	// (set by the bank or a reverse-proxy configured per-bank).
	bankHeader := strings.ToUpper(strings.TrimSpace(r.Header.Get("X-Bank-Source")))
	bank := data.KenyanBankName(bankHeader)
	if !slices.Contains(validBanks, bank) {
		httperror.BadRequest("Missing or invalid X-Bank-Source header (EQUITY or KCB)", nil, nil).Render(w)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MB cap
	if err != nil {
		httperror.BadRequest("Failed to read request body", err, nil).Render(w)
		return
	}

	deposit, err := h.Service.HandleWebhook(ctx, bank, body)
	if err != nil {
		httperror.BadRequest("Failed to process XML credit advice", err, map[string]interface{}{
			"error": err.Error(),
		}).Render(w)
		return
	}

	httpjson.RenderStatus(w, http.StatusOK, deposit, httpjson.JSON)
}
