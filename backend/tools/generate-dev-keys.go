//go:build ignore

package main

import (
	"fmt"
	"os"

	"github.com/stellar/go-stellar-sdk/keypair"
)

func main() {
	sep10Kp := keypair.MustRandom()
	distKp := keypair.MustRandom()

	envVars := fmt.Sprintf(`# ── Auto-generated dev keys ─────────────────────────────
SEP10_SIGNING_PUBLIC_KEY=%s
SEP10_SIGNING_PRIVATE_KEY=%s
DISTRIBUTION_PUBLIC_KEY=%s
DISTRIBUTION_SEED=%s
`, sep10Kp.Address(), sep10Kp.Seed(),
		distKp.Address(), distKp.Seed())

	os.Stdout.WriteString(envVars)
}
