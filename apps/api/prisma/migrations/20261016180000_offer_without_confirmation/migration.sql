-- The customer no longer confirms an offer: an offer stands until the partner completes it (done) or cancels it;
-- the customer may cancel it (declined). The "accepted" status and its transitions go away.

-- records that were "accepted" are offers again (the partner completes them); the deadline is the offer's (24 h)
UPDATE "application_org"
SET "status" = 'offer', "expires_on" = "status_on" + interval '1440 minutes'
WHERE "status" = 'accepted' AND "is_deleted" = false;

-- the offer now waits for the partner, not for the customer
UPDATE "status"
SET "customer_ka" = 'განაცხადზე მიღებულია შეთავაზება', "customer_en" = 'Offer received', "ttl_minutes" = 1440, "updated_on" = now()
WHERE "key" = 'offer' AND "is_deleted" = false;

-- transitions from / to "accepted", then the status itself
UPDATE "status_transition"
SET "is_deleted" = true, "deleted_on" = now()
WHERE "is_deleted" = false
  AND ("from_status_id" IN (SELECT "id" FROM "status" WHERE "key" = 'accepted') OR "to_status_id" IN (SELECT "id" FROM "status" WHERE "key" = 'accepted'));
UPDATE "status" SET "is_deleted" = true, "deleted_on" = now() WHERE "key" = 'accepted' AND "is_deleted" = false;

-- the partner completes an offer directly
INSERT INTO "status_transition" ("uid", "from_status_id", "to_status_id", "actor", "reason_kind", "created_on", "is_enable", "is_deleted")
SELECT gen_random_uuid(), f."id", t."id", 'partner', NULL, now(), true, false
FROM "status" f, "status" t
WHERE f."key" = 'offer' AND t."key" = 'done' AND f."is_deleted" = false AND t."is_deleted" = false
  AND NOT EXISTS (
    SELECT 1 FROM "status_transition" x
    WHERE x."from_status_id" = f."id" AND x."to_status_id" = t."id" AND x."actor" = 'partner' AND x."is_deleted" = false
  );
