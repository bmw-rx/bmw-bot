-- BMW LITE - Accounts & Security Schema (Postgres / Neon)

CREATE TABLE IF NOT EXISTS accounts (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    email           VARCHAR(160) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- FEATURE: "Device & Location" - historia ya login za akaunti yako mwenyewe
-- (kama ukurasa wa "Security/Recent Activity" wa Google/Facebook) - HII SI
-- kufuatilia wageni wa website bila ruhusa, ni akaunti kuona historia yake yenyewe.
CREATE TABLE IF NOT EXISTS login_history (
    id              SERIAL PRIMARY KEY,
    account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    ip_address      VARCHAR(64),
    city            VARCHAR(100),
    country         VARCHAR(100),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_history_account ON login_history(account_id, created_at DESC);

-- FEATURE: API Key Licensing - "BMW Bot Zip" system
-- Owner anagenerate keys kwa wateja; kila key ina muda wa kuisha (default
-- masaa 40); "is_owner=TRUE" keys hazina expiry (owner mwenyewe).
CREATE TABLE IF NOT EXISTS license_keys (
    id              SERIAL PRIMARY KEY,
    api_key         VARCHAR(64) UNIQUE NOT NULL,
    label           VARCHAR(120),
    is_owner        BOOLEAN DEFAULT FALSE,
    revoked         BOOLEAN DEFAULT FALSE,
    expires_at      TIMESTAMPTZ,                -- NULL = haina expiry (owner)
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_checkin_at TIMESTAMPTZ,
    last_checkin_ip VARCHAR(64),
    checkin_count   INTEGER DEFAULT 0,

    -- FEATURE: One-time-use zip download - key inaweza kutumika KUPAKUA
    -- zip MARA MOJA TU. Baada ya hapo, phone-home (/api/license/verify)
    -- inaendelea kufanya kazi kama kawaida (bot iliyoshapakuliwa inaendelea
    -- kufanya kazi mpaka expiry ya kawaida) - ni endpoint ya DOWNLOAD pekee
    -- inayozuiwa kutumika tena, kuzuia mtu mmoja kushiriki link na wengine.
    zip_downloaded      BOOLEAN DEFAULT FALSE,
    zip_downloaded_at   TIMESTAMPTZ
);

-- Migration salama kwa deployments zilizokuwa na license_keys tayari
-- (CREATE TABLE IF NOT EXISTS haiongezi columns kwenye jedwali lililopo
-- tayari - hii ALTER inahakikisha columns mpya zipo bila kujali).
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS zip_downloaded BOOLEAN DEFAULT FALSE;
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS zip_downloaded_at TIMESTAMPTZ;
