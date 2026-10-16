-- CreateTable
CREATE TABLE "notification" (
    "id" BIGSERIAL NOT NULL,
    "uid" UUID NOT NULL,
    "created_on" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "user_profile_id" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "application_id" BIGINT,
    "application_org_id" BIGINT,
    "read_on" TIMESTAMPTZ(3),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscription" (
    "id" BIGSERIAL NOT NULL,
    "uid" UUID NOT NULL,
    "created_on" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "user_profile_id" BIGINT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "last_sent_on" TIMESTAMPTZ(3),

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key" (
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
    "organization_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "last_used_on" TIMESTAMPTZ(3),
    "expires_on" TIMESTAMPTZ(3),

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoint" (
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
    "organization_id" BIGINT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],

    CONSTRAINT "webhook_endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" BIGSERIAL NOT NULL,
    "uid" UUID NOT NULL,
    "created_on" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endpoint_id" BIGINT NOT NULL,
    "organization_id" BIGINT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_on" TIMESTAMPTZ(3),
    "last_attempt_on" TIMESTAMPTZ(3),
    "delivered_on" TIMESTAMPTZ(3),
    "response_code" INTEGER,
    "response_body" TEXT,
    "error" TEXT,
    "duration_ms" INTEGER,

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_uid_key" ON "notification"("uid");

-- CreateIndex
CREATE INDEX "notification_user_profile_id_read_on_idx" ON "notification"("user_profile_id", "read_on");

-- CreateIndex
CREATE INDEX "notification_user_profile_id_created_on_idx" ON "notification"("user_profile_id", "created_on");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_uid_key" ON "push_subscription"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscription_user_profile_id_idx" ON "push_subscription"("user_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_uid_key" ON "api_key"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_prefix_key" ON "api_key"("prefix");

-- CreateIndex
CREATE INDEX "api_key_organization_id_idx" ON "api_key"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoint_uid_key" ON "webhook_endpoint"("uid");

-- CreateIndex
CREATE INDEX "webhook_endpoint_organization_id_idx" ON "webhook_endpoint"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_delivery_uid_key" ON "webhook_delivery"("uid");

-- CreateIndex
CREATE INDEX "webhook_delivery_status_next_attempt_on_idx" ON "webhook_delivery"("status", "next_attempt_on");

-- CreateIndex
CREATE INDEX "webhook_delivery_organization_id_created_on_idx" ON "webhook_delivery"("organization_id", "created_on");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
