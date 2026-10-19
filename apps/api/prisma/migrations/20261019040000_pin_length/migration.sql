-- The PIN's length: an admin setting for new / changed PINs; every user keeps the length of the PIN they have.
ALTER TABLE "user" ADD COLUMN "pin_length" INTEGER;
UPDATE "user" SET "pin_length" = 4 WHERE "pin_hash" IS NOT NULL AND "pin_length" IS NULL;

INSERT INTO "setting" ("uid", "key", "value", "created_on", "is_enable", "is_deleted")
SELECT gen_random_uuid(), 'pin', '{"length": 4}'::jsonb, now(), true, false
WHERE NOT EXISTS (SELECT 1 FROM "setting" WHERE "key" = 'pin' AND "is_deleted" = false);
