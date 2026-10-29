-- a product's limits cover all its amount ranges (100 → 1 000, 1 000 → 10 000, …)
UPDATE "product_type" SET "min_amount" = (SELECT min(r) FROM unnest("amount_ranges") r), "max_amount" = (SELECT max(r) FROM unnest("amount_ranges") r) * 10
WHERE cardinality("amount_ranges") > 0;

-- the amounts each organisation lends for a product; for now the product's whole range
ALTER TABLE "organization_product_type" ADD COLUMN "min_amount" DECIMAL(14,2), ADD COLUMN "max_amount" DECIMAL(14,2);
UPDATE "organization_product_type" o SET "min_amount" = p."min_amount", "max_amount" = p."max_amount" FROM "product_type" p WHERE p."id" = o."product_type_id";
