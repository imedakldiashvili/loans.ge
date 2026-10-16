-- The customer confirms an offer again ("accepted"), and only that opens the applicant's contacts (phone, e-mail)
-- to the partner. Reverses 20261016180000_offer_without_confirmation and adds the contacts rule.

ALTER TABLE "status" ADD COLUMN "reveals_contacts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "application_org" ADD COLUMN "contacts_opened_on" TIMESTAMPTZ(3);

-- "accepted" is back, with its transitions; entering it opens the contacts
UPDATE "status" SET "is_deleted" = false, "deleted_on" = NULL, "reveals_contacts" = true, "updated_on" = now() WHERE "key" = 'accepted';
UPDATE "status_transition"
SET "is_deleted" = false, "deleted_on" = NULL
WHERE "is_deleted" = true
  AND ("from_status_id" IN (SELECT "id" FROM "status" WHERE "key" = 'accepted') OR "to_status_id" IN (SELECT "id" FROM "status" WHERE "key" = 'accepted'));

-- the offer waits for the customer's answer again; the partner no longer completes an unconfirmed offer
UPDATE "status"
SET "customer_ka" = 'განაცხადზე შეთავაზება დასადასტურებელია', "customer_en" = 'Offer awaiting confirmation', "ttl_minutes" = 60, "updated_on" = now()
WHERE "key" = 'offer' AND "is_deleted" = false;
UPDATE "status_transition"
SET "is_deleted" = true, "deleted_on" = now()
WHERE "is_deleted" = false AND "actor" = 'partner'
  AND "from_status_id" IN (SELECT "id" FROM "status" WHERE "key" = 'offer')
  AND "to_status_id" IN (SELECT "id" FROM "status" WHERE "key" = 'done');

-- records the customer already confirmed (now or earlier) keep the contacts open
UPDATE "application_org" ao
SET "contacts_opened_on" = COALESCE(
  (SELECT MIN(e."created_on") FROM "status_event" e WHERE e."application_org_id" = ao."id" AND e."to_status" = 'accepted'),
  ao."status_on")
WHERE ao."status" IN ('accepted', 'done')
   OR EXISTS (SELECT 1 FROM "status_event" e WHERE e."application_org_id" = ao."id" AND e."to_status" = 'accepted');
