-- +migrate Up

CREATE TYPE kenyan_bank_name AS ENUM ('EQUITY', 'KCB');
CREATE TYPE kenyan_bank_integration_status AS ENUM ('NOT_CONFIGURED', 'ACTIVE', 'SUSPENDED');
CREATE TYPE kenyan_bank_deposit_status AS ENUM ('RECEIVED', 'PENDING_SWAP', 'SWAPPED', 'FAILED');

CREATE TABLE kenyan_bank_integration (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank                 kenyan_bank_name NOT NULL,
    status               kenyan_bank_integration_status NOT NULL DEFAULT 'NOT_CONFIGURED',
    paybill_number       VARCHAR(20),
    account_number       VARCHAR(30),
    webhook_secret       VARCHAR(128),
    activated_by         VARCHAR(255),
    activated_at         TIMESTAMPTZ,
    error_message        TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_kenyan_bank_integration_bank ON kenyan_bank_integration (bank);

CREATE TABLE kenyan_bank_deposits (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank                 kenyan_bank_name NOT NULL,
    xml_message_id       VARCHAR(128) NOT NULL,
    kes_amount           NUMERIC(20, 4) NOT NULL,
    usdc_amount          NUMERIC(20, 7),
    kes_to_usd_rate      NUMERIC(20, 7),
    sender_name          VARCHAR(255),
    sender_account       VARCHAR(60),
    sender_bank          VARCHAR(255),
    narration            TEXT,
    reference_number     VARCHAR(128),
    status               kenyan_bank_deposit_status NOT NULL DEFAULT 'RECEIVED',
    stellar_tx_hash      VARCHAR(64),
    received_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    converted_at         TIMESTAMPTZ,
    error_message        TEXT
);

CREATE UNIQUE INDEX uq_kenyan_bank_deposits_msg ON kenyan_bank_deposits (xml_message_id);
CREATE INDEX idx_kenyan_bank_deposits_status ON kenyan_bank_deposits (status);

-- +migrate Down

DROP INDEX IF EXISTS idx_kenyan_bank_deposits_status;
DROP INDEX IF EXISTS uq_kenyan_bank_deposits_msg;
DROP TABLE IF EXISTS kenyan_bank_deposits;
DROP INDEX IF EXISTS uq_kenyan_bank_integration_bank;
DROP TABLE IF EXISTS kenyan_bank_integration;
DROP TYPE IF EXISTS kenyan_bank_deposit_status;
DROP TYPE IF EXISTS kenyan_bank_integration_status;
DROP TYPE IF EXISTS kenyan_bank_name;
