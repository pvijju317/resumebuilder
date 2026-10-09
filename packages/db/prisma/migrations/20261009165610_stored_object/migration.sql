-- CreateTable
CREATE TABLE "StoredObject" (
    "key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "body" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredObject_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "StoredObject_createdAt_idx" ON "StoredObject"("createdAt");

