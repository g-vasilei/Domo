-- CreateEnum
CREATE TYPE "AlarmState" AS ENUM ('DISARMED', 'ARMED_HOME', 'ARMED_AWAY', 'EXIT_DELAY', 'ENTRY_DELAY', 'TRIGGERED');

-- CreateTable
CREATE TABLE "AlarmSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "AlarmState" NOT NULL DEFAULT 'DISARMED',
    "stateAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinHash" TEXT,
    "exitDelaySecs" INTEGER NOT NULL DEFAULT 30,
    "entryDelaySecs" INTEGER NOT NULL DEFAULT 30,
    "displayMode" BOOLEAN NOT NULL DEFAULT false,
    "showClock" BOOLEAN NOT NULL DEFAULT true,
    "showTemp" BOOLEAN NOT NULL DEFAULT true,
    "showHumidity" BOOLEAN NOT NULL DEFAULT true,
    "tempDeviceId" TEXT,
    "humidDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlarmSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlarmSettings_userId_key" ON "AlarmSettings"("userId");

-- AddForeignKey
ALTER TABLE "AlarmSettings" ADD CONSTRAINT "AlarmSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
