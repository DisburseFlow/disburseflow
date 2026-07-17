-- +migrate Up

CREATE TYPE participant_wallet_status AS ENUM ('PENDING', 'READY', 'FAILED');

CREATE TABLE participant_wallets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number      VARCHAR(64) NOT NULL,
    stellar_address   VARCHAR(56) NOT NULL DEFAULT '',
    stellar_seed      TEXT NOT NULL DEFAULT '',
    status            participant_wallet_status NOT NULL DEFAULT 'PENDING',
    failure_reason    VARCHAR(64) NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_participant_wallets_phone_number ON participant_wallets (phone_number);

CREATE TRIGGER refresh_participant_wallets_updated_at BEFORE UPDATE ON participant_wallets FOR EACH ROW EXECUTE PROCEDURE update_at_refresh();

-- +migrate Down

DROP TRIGGER refresh_participant_wallets_updated_at ON participant_wallets;
DROP INDEX IF EXISTS uq_participant_wallets_phone_number;
DROP TABLE IF EXISTS participant_wallets;
DROP TYPE IF EXISTS participant_wallet_status;
