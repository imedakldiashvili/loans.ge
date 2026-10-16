-- The customer chooses an offer, not only an organisation (one organisation may send several offers).
ALTER TABLE "offer" ADD COLUMN "chosen_on" TIMESTAMPTZ(3);

-- organisations the customer already accepted: their offers count as chosen (when it was accepted)
UPDATE "offer" f
SET "chosen_on" = COALESCE(
  (SELECT MIN(e."created_on") FROM "status_event" e WHERE e."application_org_id" = f."application_org_id" AND e."to_status" = 'accepted'),
  ao."status_on")
FROM "application_org" ao
WHERE ao."id" = f."application_org_id" AND f."is_deleted" = false
  AND (ao."status" IN ('accepted', 'done') OR EXISTS (SELECT 1 FROM "status_event" e WHERE e."application_org_id" = ao."id" AND e."to_status" = 'accepted'));
