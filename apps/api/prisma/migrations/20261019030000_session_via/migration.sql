-- How a session was opened (otp | pin): a fresh code session may set / reset the PIN without another code.
ALTER TABLE "session" ADD COLUMN "via" TEXT NOT NULL DEFAULT 'otp';
