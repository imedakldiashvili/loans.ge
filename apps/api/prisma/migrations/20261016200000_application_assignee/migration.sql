-- An incoming application is visible to every staff member in scope; the first one to act on it takes it.
ALTER TABLE "application_org" ADD COLUMN "assigned_to_id" BIGINT, ADD COLUMN "assigned_on" TIMESTAMPTZ(3);
ALTER TABLE "application_org" ADD CONSTRAINT "application_org_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "user_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "application_org_assigned_to_id_idx" ON "application_org"("assigned_to_id");
