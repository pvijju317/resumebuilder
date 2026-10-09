-- Anonymous sessions are temporary (72 h) and predate the token column; clear them so the
-- required column can be added.
DELETE FROM "AnonSession";

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_jdCacheId_fkey";

-- AlterTable
ALTER TABLE "AnonSession" ADD COLUMN     "claimedByUserId" TEXT,
ADD COLUMN     "resumeLayout" JSONB,
ADD COLUMN     "tokenHash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "error" TEXT,
ADD COLUMN     "rawText" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ready',
ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "jdCacheId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UploadedFile" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AnonSession_tokenHash_key" ON "AnonSession"("tokenHash");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_jdCacheId_fkey" FOREIGN KEY ("jdCacheId") REFERENCES "JdCache"("id") ON DELETE SET NULL ON UPDATE CASCADE;

