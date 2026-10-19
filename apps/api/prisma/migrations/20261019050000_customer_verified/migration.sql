-- identity verification of the borrower (personal number, name); user.is_verified only means a contact confirmed with a code
ALTER TABLE "customer_detail" ADD COLUMN "is_verified" BOOLEAN NOT NULL DEFAULT false;
