-- DropIndex
DROP INDEX "city_code_key";

-- DropIndex
DROP INDEX "currency_code_key";

-- DropIndex
DROP INDEX "district_city_id_code_key";

-- DropIndex
DROP INDEX "organization_product_type_organization_id_product_type_id_key";

-- DropIndex
DROP INDEX "product_type_code_key";

-- DropIndex
DROP INDEX "product_type_field_product_type_id_key_key";

-- DropIndex
DROP INDEX "profile_type_code_key";

-- DropIndex
DROP INDEX "reference_item_kind_code_key";

-- DropIndex
DROP INDEX "region_code_key";

-- DropIndex
DROP INDEX "setting_key_key";

-- DropIndex
DROP INDEX "status_key_key";

-- DropIndex
DROP INDEX "status_transition_from_status_id_to_status_id_actor_key";

-- CreateIndex
CREATE INDEX "city_code_idx" ON "city"("code");

-- CreateIndex
CREATE INDEX "currency_code_idx" ON "currency"("code");

-- CreateIndex
CREATE INDEX "district_city_id_code_idx" ON "district"("city_id", "code");

-- CreateIndex
CREATE INDEX "organization_product_type_organization_id_product_type_id_idx" ON "organization_product_type"("organization_id", "product_type_id");

-- CreateIndex
CREATE INDEX "product_type_code_idx" ON "product_type"("code");

-- CreateIndex
CREATE INDEX "product_type_field_product_type_id_key_idx" ON "product_type_field"("product_type_id", "key");

-- CreateIndex
CREATE INDEX "profile_type_code_idx" ON "profile_type"("code");

-- CreateIndex
CREATE INDEX "reference_item_kind_code_idx" ON "reference_item"("kind", "code");

-- CreateIndex
CREATE INDEX "region_code_idx" ON "region"("code");

-- CreateIndex
CREATE INDEX "setting_key_idx" ON "setting"("key");

-- CreateIndex
CREATE INDEX "status_key_idx" ON "status"("key");

-- CreateIndex
CREATE INDEX "status_transition_from_status_id_to_status_id_actor_idx" ON "status_transition"("from_status_id", "to_status_id", "actor");
