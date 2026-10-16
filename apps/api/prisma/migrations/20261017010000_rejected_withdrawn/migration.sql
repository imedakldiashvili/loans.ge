-- Closing a record before an offer is told apart from closing an offer:
--   rejected  — the organisation rejected the application (no offer)      ← was "cancelled" from sent / interested
--   withdrawn — the customer declined before any offer came               ← was "declined" from sent / interested
--   cancelled — the organisation cancelled its offer;  declined — the customer declined the offer.
-- Customer texts as agreed; the other labels / deadlines set in admin stay.

-- order: … done, rejected, cancelled, withdrawn, declined, expired
UPDATE "status" SET "sort" = 7, "updated_on" = now() WHERE "key" = 'cancelled' AND "is_deleted" = false;
UPDATE "status" SET "sort" = 9, "updated_on" = now() WHERE "key" = 'declined' AND "is_deleted" = false;
UPDATE "status" SET "sort" = 10, "updated_on" = now() WHERE "key" = 'expired' AND "is_deleted" = false;

INSERT INTO "status" ("uid", "key", "sort", "category", "ttl_minutes", "customer_ka", "customer_en", "partner_label", "chip_label", "created_on", "is_enable", "is_deleted")
SELECT gen_random_uuid(), v.key, v.sort, 'canceled', NULL, v.ka, v.en, v.partner, v.partner, now(), true, false
FROM (VALUES
  ('rejected', 6, 'უარყოფილია ორგანიზაციის მიერ', 'Rejected by the organisation', 'უარყო პარტნიორმა'),
  ('withdrawn', 8, 'უარყოფილი მომხმარებლის მიერ', 'Declined by the customer', 'უარი თქვა მომხმარებელმა')
) AS v(key, sort, ka, en, partner)
WHERE NOT EXISTS (SELECT 1 FROM "status" s WHERE s."key" = v.key AND s."is_deleted" = false);

UPDATE "status" SET "customer_ka" = 'შეთავაზება გამოიგზავნა', "customer_en" = 'Offer sent', "updated_on" = now() WHERE "key" = 'offer' AND "is_deleted" = false;
UPDATE "status" SET "customer_ka" = 'შეთავაზება გაუქმებულია ორგანიზაციის მიერ', "customer_en" = 'Offer cancelled by the organisation', "partner_label" = 'შეთავაზება გააუქმა პარტნიორმა', "chip_label" = 'გააუქმა პარტნიორმა', "updated_on" = now() WHERE "key" = 'cancelled' AND "is_deleted" = false;
UPDATE "status" SET "customer_ka" = 'შეთავაზება უარყოფილი მომხმარებლის მიერ', "customer_en" = 'Offer declined by the customer', "partner_label" = 'შეთავაზება უარყო მომხმარებელმა', "chip_label" = 'გააუქმა მომხმარებელმა', "updated_on" = now() WHERE "key" = 'declined' AND "is_deleted" = false;
UPDATE "status" SET "customer_ka" = 'შეთავაზება დასრულებული', "customer_en" = 'Offer completed', "updated_on" = now() WHERE "key" = 'done' AND "is_deleted" = false;

-- before an offer: the partner rejects → rejected, the customer declines → withdrawn
UPDATE "status_transition" st
SET "to_status_id" = (SELECT "id" FROM "status" WHERE "key" = 'rejected' AND "is_deleted" = false), "updated_on" = now()
WHERE st."is_deleted" = false AND st."actor" = 'partner'
  AND st."from_status_id" IN (SELECT "id" FROM "status" WHERE "key" IN ('sent', 'interested'))
  AND st."to_status_id" IN (SELECT "id" FROM "status" WHERE "key" = 'cancelled');
UPDATE "status_transition" st
SET "to_status_id" = (SELECT "id" FROM "status" WHERE "key" = 'withdrawn' AND "is_deleted" = false), "updated_on" = now()
WHERE st."is_deleted" = false AND st."actor" = 'customer'
  AND st."from_status_id" IN (SELECT "id" FROM "status" WHERE "key" IN ('sent', 'interested'))
  AND st."to_status_id" IN (SELECT "id" FROM "status" WHERE "key" = 'declined');

-- records closed before an offer get the new statuses
UPDATE "application_org" ao SET "status" = 'rejected'
WHERE ao."status" = 'cancelled' AND NOT EXISTS (SELECT 1 FROM "offer" o WHERE o."application_org_id" = ao."id" AND o."is_deleted" = false);
UPDATE "application_org" ao SET "status" = 'withdrawn'
WHERE ao."status" = 'declined' AND NOT EXISTS (SELECT 1 FROM "offer" o WHERE o."application_org_id" = ao."id" AND o."is_deleted" = false);
