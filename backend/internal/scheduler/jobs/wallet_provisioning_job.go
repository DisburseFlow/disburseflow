package jobs

import (
	"context"
	"fmt"
	"time"

	"github.com/stellar/go-stellar-sdk/support/log"

	"github.com/stellar/stellar-disbursement-platform-backend/internal/data"
	"github.com/stellar/stellar-disbursement-platform-backend/internal/services"
)

const (
	walletProvisioningJobName      = "wallet_provisioning_job"
	walletProvisioningJobBatchSize = 50
)

type WalletProvisioningJobOptions struct {
	Models             *data.Models
	WalletProvisioner  data.WalletProvisioner
	JobIntervalSeconds int
}

// walletProvisioningJob periodically creates and funds Stellar wallets for
// phone-only registration receivers who don't have one yet. This runs out of
// band from CSV upload — see internal/services/wallet_provisioning_service.go
// for why (creating a wallet is slow; the upload response shouldn't wait on it).
type walletProvisioningJob struct {
	service            services.WalletProvisioningServiceInterface
	jobIntervalSeconds int
}

func (j walletProvisioningJob) GetName() string {
	return walletProvisioningJobName
}

func (j walletProvisioningJob) GetInterval() time.Duration {
	return time.Duration(j.jobIntervalSeconds) * time.Second
}

func (j walletProvisioningJob) IsJobMultiTenant() bool {
	return true
}

func (j walletProvisioningJob) Execute(ctx context.Context) error {
	if err := j.service.ProvisionPendingWallets(ctx, walletProvisioningJobBatchSize); err != nil {
		err = fmt.Errorf("provisioning pending wallets: %w", err)
		log.Ctx(ctx).Error(err)
		return err
	}
	return nil
}

func NewWalletProvisioningJob(options WalletProvisioningJobOptions) Job {
	if options.JobIntervalSeconds < DefaultMinimumJobIntervalSeconds {
		log.Fatalf("job interval for %s is set below the minimum %d. Instantiation failed", walletProvisioningJobName, DefaultMinimumJobIntervalSeconds)
	}

	return &walletProvisioningJob{
		service: &services.WalletProvisioningService{
			Models:            options.Models,
			WalletProvisioner: options.WalletProvisioner,
		},
		jobIntervalSeconds: options.JobIntervalSeconds,
	}
}

var _ Job = (*walletProvisioningJob)(nil)
