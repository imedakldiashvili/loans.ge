/*
  Warnings:

  - Added the required column `challenge_uid` to the `dev_outbox` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "dev_outbox" ADD COLUMN     "challenge_uid" UUID NOT NULL;
