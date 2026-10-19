-- Passkeys are replaced by a site PIN (customers sign in with e-mail / mobile + PIN).
DROP TABLE IF EXISTS "passkey";

ALTER TABLE "user"
  ADD COLUMN "pin_hash" TEXT,
  ADD COLUMN "pin_set_on" TIMESTAMPTZ(3),
  ADD COLUMN "pin_fails" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pin_locked_until" TIMESTAMPTZ(3);
