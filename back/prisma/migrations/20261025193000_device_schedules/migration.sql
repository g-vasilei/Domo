CREATE TABLE "DeviceSchedule" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "deviceName" TEXT NOT NULL,
  "switchCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "days" INTEGER[] NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeviceSchedule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DeviceScheduleSlot" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "time" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL,
  "lastRunKey" TEXT,
  CONSTRAINT "DeviceScheduleSlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeviceScheduleSlot_minutes_check" CHECK ("minutes" BETWEEN 1 AND 1440)
);
CREATE INDEX "DeviceSchedule_userId_deviceId_idx" ON "DeviceSchedule"("userId", "deviceId");
CREATE UNIQUE INDEX "DeviceScheduleSlot_scheduleId_time_key" ON "DeviceScheduleSlot"("scheduleId", "time");
ALTER TABLE "DeviceSchedule" ADD CONSTRAINT "DeviceSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceScheduleSlot" ADD CONSTRAINT "DeviceScheduleSlot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "DeviceSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
