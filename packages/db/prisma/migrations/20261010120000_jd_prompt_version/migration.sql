-- Entries extracted before prompt versioning came from jd.extract v1.
ALTER TABLE "JdCache" ADD COLUMN "promptVersion" TEXT NOT NULL DEFAULT 'v1';
