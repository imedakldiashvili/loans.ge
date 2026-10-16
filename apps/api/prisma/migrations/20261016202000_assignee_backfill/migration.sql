-- Records partners already worked on: taken by the staff member who made the first partner status change.
UPDATE "application_org" ao
SET "assigned_to_id" = x."profile_id", "assigned_on" = x."created_on"
FROM (
  SELECT DISTINCT ON (e."application_org_id") e."application_org_id", e."created_on", up."id" AS "profile_id"
  FROM "status_event" e
  JOIN "application_org" o ON o."id" = e."application_org_id"
  JOIN "user_profile" up ON up."user_id" = e."created_by" AND up."organization_id" = o."organization_id" AND up."is_deleted" = false
  WHERE e."actor" = 'partner' AND e."is_deleted" = false
  ORDER BY e."application_org_id", e."created_on"
) x
WHERE ao."id" = x."application_org_id" AND ao."assigned_to_id" IS NULL;
