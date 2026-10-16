-- CreateTable
CREATE TABLE "job_run" (
    "id" BIGSERIAL NOT NULL,
    "uid" UUID NOT NULL,
    "job" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_on" TIMESTAMPTZ(3) NOT NULL,
    "completed_on" TIMESTAMPTZ(3),
    "duration_ms" INTEGER,
    "checked" INTEGER NOT NULL DEFAULT 0,
    "changed" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "error" TEXT,
    "instance" TEXT,

    CONSTRAINT "job_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_run_uid_key" ON "job_run"("uid");

-- CreateIndex
CREATE INDEX "job_run_job_started_on_idx" ON "job_run"("job", "started_on");

-- CreateIndex
CREATE INDEX "job_run_started_on_idx" ON "job_run"("started_on");
