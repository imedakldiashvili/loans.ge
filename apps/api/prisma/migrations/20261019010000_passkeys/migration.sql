-- Passkeys (WebAuthn): sign in without a code. Only the public key is kept.
CREATE TABLE "passkey" (
    "id" BIGSERIAL NOT NULL,
    "uid" UUID NOT NULL,
    "is_enable" BOOLEAN NOT NULL DEFAULT true,
    "created_by" BIGINT,
    "created_on" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" BIGINT,
    "updated_on" TIMESTAMPTZ(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_by" BIGINT,
    "deleted_on" TIMESTAMPTZ(3),
    "user_id" BIGINT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "device_type" TEXT,
    "backed_up" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "last_used_on" TIMESTAMPTZ(3),
    CONSTRAINT "passkey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "passkey_uid_key" ON "passkey"("uid");
CREATE UNIQUE INDEX "passkey_credential_id_key" ON "passkey"("credential_id");
CREATE INDEX "passkey_user_id_idx" ON "passkey"("user_id");
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
