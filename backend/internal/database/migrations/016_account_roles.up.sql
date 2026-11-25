CREATE TYPE account_role AS ENUM ('common', 'premium', 'admin');

ALTER TABLE users ADD COLUMN role account_role NOT NULL DEFAULT 'common';
