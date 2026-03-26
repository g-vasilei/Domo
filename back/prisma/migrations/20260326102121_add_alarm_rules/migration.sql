-- CreateEnum
CREATE TYPE "AlarmAction" AS ENUM ('ENTRY_DELAY', 'IMMEDIATE');

-- CreateTable
CREATE TABLE "AlarmRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "triggerCode" TEXT NOT NULL,
    "triggerValue" JSONB NOT NULL,
    "activeInHome" BOOLEAN NOT NULL DEFAULT false,
    "activeInAway" BOOLEAN NOT NULL DEFAULT true,
    "action" "AlarmAction" NOT NULL DEFAULT 'ENTRY_DELAY',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlarmRule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AlarmRule" ADD CONSTRAINT "AlarmRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
