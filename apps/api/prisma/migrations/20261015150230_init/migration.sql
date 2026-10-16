-- CreateTable
CREATE TABLE "currency" (
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
    "code" VARCHAR(3) NOT NULL,
    "symbol" VARCHAR(4) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region" (
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
    "code" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city" (
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
    "region_id" BIGINT NOT NULL,
    "code" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "city_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "district" (
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
    "city_id" BIGINT NOT NULL,
    "code" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "district_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_item" (
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
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reference_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_type" (
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
    "code" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "min_amount" DECIMAL(14,2) NOT NULL,
    "max_amount" DECIMAL(14,2) NOT NULL,
    "min_months" INTEGER,
    "max_months" INTEGER,
    "no_term" BOOLEAN NOT NULL DEFAULT false,
    "amount_ranges" INTEGER[],
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_type_field" (
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
    "product_type_id" BIGINT NOT NULL,
    "key" TEXT NOT NULL,
    "label_ka" TEXT NOT NULL,
    "label_en" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "default_value" JSONB,
    "step" DECIMAL(10,4),
    "options" JSONB,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_type_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
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
    "name_ka" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "color" VARCHAR(9),
    "logo_path" TEXT,
    "is_partner" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_product_type" (
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
    "product_type_id" BIGINT NOT NULL,

    CONSTRAINT "organization_product_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_product" (
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
    "product_type_id" BIGINT NOT NULL,
    "description" TEXT,
    "currencies" TEXT[],

    CONSTRAINT "partner_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_offer_card" (
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
    "product_id" BIGINT NOT NULL,
    "offer_type_id" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "values" JSONB NOT NULL,

    CONSTRAINT "partner_offer_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
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
    "email" TEXT,
    "phone" TEXT,
    "user_name" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "last_login_on" TIMESTAMPTZ(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_type" (
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
    "code" TEXT NOT NULL,
    "name_ka" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,

    CONSTRAINT "profile_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile" (
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
    "profile_type_id" BIGINT NOT NULL,
    "organization_id" BIGINT,
    "role" TEXT,
    "display_name" TEXT,
    "scope_products" BIGINT[],
    "scope_cities" BIGINT[],

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_detail" (
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
    "user_profile_id" BIGINT NOT NULL,
    "pid" VARCHAR(11),
    "first_name" TEXT,
    "last_name" TEXT,
    "birth_date" DATE,
    "city_id" BIGINT,
    "district_id" BIGINT,
    "village" TEXT,

    CONSTRAINT "customer_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_identity" (
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
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,

    CONSTRAINT "oauth_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
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
    "user_profile_id" BIGINT NOT NULL,
    "gateway" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_on" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenge" (
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
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_on" TIMESTAMPTZ(3) NOT NULL,
    "consumed_on" TIMESTAMPTZ(3),

    CONSTRAINT "otp_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status" (
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
    "key" TEXT NOT NULL,
    "customer_ka" TEXT NOT NULL,
    "customer_en" TEXT NOT NULL,
    "partner_label" TEXT NOT NULL,
    "chip_label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "color" VARCHAR(9),
    "ttl_minutes" INTEGER,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "hides_personal_data" BOOLEAN NOT NULL DEFAULT false,
    "requires_offer" BOOLEAN NOT NULL DEFAULT false,
    "requires_issued" BOOLEAN NOT NULL DEFAULT false,
    "is_expiry_target" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_transition" (
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
    "from_status_id" BIGINT NOT NULL,
    "to_status_id" BIGINT NOT NULL,
    "actor" TEXT NOT NULL,
    "reason_kind" TEXT,

    CONSTRAINT "status_transition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
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
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
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
    "product_type_id" BIGINT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "source" TEXT,
    "pid" VARCHAR(11) NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "birth_date" DATE,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city_id" BIGINT,
    "district_id" BIGINT,
    "village" TEXT,
    "credit_history" TEXT,
    "sector" TEXT,
    "incomes" JSONB,
    "banks" JSONB,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_org" (
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
    "application_id" BIGINT NOT NULL,
    "organization_id" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "status_on" TIMESTAMPTZ(3) NOT NULL,
    "expires_on" TIMESTAMPTZ(3),
    "sent_on" TIMESTAMPTZ(3) NOT NULL,
    "offer_on" TIMESTAMPTZ(3),
    "reason_ids" BIGINT[],
    "reason_text" TEXT,
    "issued" BOOLEAN NOT NULL DEFAULT false,
    "issued_on" TIMESTAMPTZ(3),

    CONSTRAINT "application_org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer" (
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
    "application_org_id" BIGINT NOT NULL,
    "card_id" BIGINT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "months" INTEGER NOT NULL,
    "rate" DECIMAL(6,3) NOT NULL,
    "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ins_month" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "values" JSONB,

    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_event" (
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
    "application_org_id" BIGINT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "request_uid" UUID,

    CONSTRAINT "status_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_log" (
    "id" BIGSERIAL NOT NULL,
    "uid" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "gateway" TEXT,
    "module" TEXT,
    "action" TEXT,
    "item_id" BIGINT,
    "item_uid" UUID,
    "created_by" BIGINT,
    "user_profile_id" BIGINT,
    "actor_type" TEXT,
    "created_on" TIMESTAMPTZ(3) NOT NULL,
    "completed_on" TIMESTAMPTZ(3),
    "duration_ms" INTEGER,
    "response_code" INTEGER,
    "is_success" BOOLEAN,
    "error_code" TEXT,
    "error_message" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "action_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_log_request" (
    "id" BIGSERIAL NOT NULL,
    "uid" UUID NOT NULL,
    "headers" JSONB,
    "query" JSONB,
    "body" JSONB,
    "created_on" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "action_log_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_log_response" (
    "id" BIGSERIAL NOT NULL,
    "uid" UUID NOT NULL,
    "response_code" INTEGER NOT NULL,
    "body" JSONB,
    "created_on" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "action_log_response_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "currency_uid_key" ON "currency"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "currency_code_key" ON "currency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "region_uid_key" ON "region"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "region_code_key" ON "region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "city_uid_key" ON "city"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "city_code_key" ON "city"("code");

-- CreateIndex
CREATE UNIQUE INDEX "district_uid_key" ON "district"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "district_city_id_code_key" ON "district"("city_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "reference_item_uid_key" ON "reference_item"("uid");

-- CreateIndex
CREATE INDEX "reference_item_kind_sort_idx" ON "reference_item"("kind", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "reference_item_kind_code_key" ON "reference_item"("kind", "code");

-- CreateIndex
CREATE UNIQUE INDEX "product_type_uid_key" ON "product_type"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "product_type_code_key" ON "product_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_type_field_uid_key" ON "product_type_field"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "product_type_field_product_type_id_key_key" ON "product_type_field"("product_type_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "organization_uid_key" ON "organization"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "organization_product_type_uid_key" ON "organization_product_type"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "organization_product_type_organization_id_product_type_id_key" ON "organization_product_type"("organization_id", "product_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_product_uid_key" ON "partner_product"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "partner_offer_card_uid_key" ON "partner_offer_card"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "user_uid_key" ON "user"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "profile_type_uid_key" ON "profile_type"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "profile_type_code_key" ON "profile_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_profile_uid_key" ON "user_profile"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "user_profile_user_id_profile_type_id_organization_id_key" ON "user_profile"("user_id", "profile_type_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_detail_uid_key" ON "customer_detail"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "customer_detail_user_profile_id_key" ON "customer_detail"("user_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_identity_uid_key" ON "oauth_identity"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_identity_provider_subject_key" ON "oauth_identity"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "session_uid_key" ON "session"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "otp_challenge_uid_key" ON "otp_challenge"("uid");

-- CreateIndex
CREATE INDEX "otp_challenge_target_purpose_idx" ON "otp_challenge"("target", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "status_uid_key" ON "status"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "status_key_key" ON "status"("key");

-- CreateIndex
CREATE UNIQUE INDEX "status_transition_uid_key" ON "status_transition"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "status_transition_from_status_id_to_status_id_actor_key" ON "status_transition"("from_status_id", "to_status_id", "actor");

-- CreateIndex
CREATE UNIQUE INDEX "setting_uid_key" ON "setting"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "setting_key_key" ON "setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "application_uid_key" ON "application"("uid");

-- CreateIndex
CREATE INDEX "application_user_id_idx" ON "application"("user_id");

-- CreateIndex
CREATE INDEX "application_created_on_idx" ON "application"("created_on");

-- CreateIndex
CREATE UNIQUE INDEX "application_org_uid_key" ON "application_org"("uid");

-- CreateIndex
CREATE INDEX "application_org_organization_id_status_idx" ON "application_org"("organization_id", "status");

-- CreateIndex
CREATE INDEX "application_org_status_expires_on_idx" ON "application_org"("status", "expires_on");

-- CreateIndex
CREATE UNIQUE INDEX "application_org_application_id_organization_id_key" ON "application_org"("application_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "offer_uid_key" ON "offer"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "status_event_uid_key" ON "status_event"("uid");

-- CreateIndex
CREATE INDEX "status_event_application_org_id_created_on_idx" ON "status_event"("application_org_id", "created_on");

-- CreateIndex
CREATE UNIQUE INDEX "action_log_uid_key" ON "action_log"("uid");

-- CreateIndex
CREATE INDEX "action_log_created_on_idx" ON "action_log"("created_on");

-- CreateIndex
CREATE INDEX "action_log_created_by_idx" ON "action_log"("created_by");

-- CreateIndex
CREATE INDEX "action_log_module_item_id_idx" ON "action_log"("module", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "action_log_request_uid_key" ON "action_log_request"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "action_log_response_uid_key" ON "action_log_response"("uid");

-- AddForeignKey
ALTER TABLE "city" ADD CONSTRAINT "city_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "district" ADD CONSTRAINT "district_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "city"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_type_field" ADD CONSTRAINT "product_type_field_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_product_type" ADD CONSTRAINT "organization_product_type_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_product_type" ADD CONSTRAINT "organization_product_type_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_product" ADD CONSTRAINT "partner_product_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_product" ADD CONSTRAINT "partner_product_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_offer_card" ADD CONSTRAINT "partner_offer_card_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "partner_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_profile_type_id_fkey" FOREIGN KEY ("profile_type_id") REFERENCES "profile_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_detail" ADD CONSTRAINT "customer_detail_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_identity" ADD CONSTRAINT "oauth_identity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_transition" ADD CONSTRAINT "status_transition_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_transition" ADD CONSTRAINT "status_transition_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_org" ADD CONSTRAINT "application_org_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_org" ADD CONSTRAINT "application_org_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_application_org_id_fkey" FOREIGN KEY ("application_org_id") REFERENCES "application_org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "partner_offer_card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_event" ADD CONSTRAINT "status_event_application_org_id_fkey" FOREIGN KEY ("application_org_id") REFERENCES "application_org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
