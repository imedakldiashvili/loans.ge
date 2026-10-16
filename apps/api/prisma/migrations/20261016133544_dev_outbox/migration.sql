-- CreateTable
CREATE TABLE "dev_outbox" (
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
    "channel" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "expires_on" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dev_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dev_outbox_uid_key" ON "dev_outbox"("uid");

-- CreateIndex
CREATE INDEX "dev_outbox_created_on_idx" ON "dev_outbox"("created_on");

-- CreateIndex
CREATE INDEX "dev_outbox_target_idx" ON "dev_outbox"("target");
