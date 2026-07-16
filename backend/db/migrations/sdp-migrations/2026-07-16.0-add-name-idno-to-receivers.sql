-- +migrate Up

ALTER TABLE receivers
    ADD COLUMN IF NOT EXISTS name  VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS id_no VARCHAR(8);

-- +migrate Down

ALTER TABLE receivers
    DROP COLUMN IF EXISTS name,
    DROP COLUMN IF EXISTS id_no;
