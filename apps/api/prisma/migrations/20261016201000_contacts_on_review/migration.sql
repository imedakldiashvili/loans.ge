-- The applicant's phone / e-mail open to the partner as soon as it starts the review ("interested"),
-- not only after the customer confirms an offer. Only the flag changes (labels / deadlines stay as set in admin).
UPDATE "status" SET "reveals_contacts" = true, "updated_on" = now() WHERE "key" = 'interested' AND "is_deleted" = false;

-- records already past the start of the review get their contacts
UPDATE "application_org" ao
SET "contacts_opened_on" = COALESCE(
  (SELECT MIN(e."created_on") FROM "status_event" e WHERE e."application_org_id" = ao."id" AND e."to_status" = 'interested'),
  ao."status_on")
WHERE ao."contacts_opened_on" IS NULL
  AND (ao."status" IN ('interested', 'offer', 'accepted', 'done')
       OR EXISTS (SELECT 1 FROM "status_event" e WHERE e."application_org_id" = ao."id" AND e."to_status" = 'interested'));
