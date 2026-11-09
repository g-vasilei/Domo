ALTER TABLE "User" ADD COLUMN "dashboardTemperatureDeviceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Preserve an explicitly configured thermometer from the previous dashboard.
UPDATE "User" AS u SET "dashboardTemperatureDeviceIds" = ARRAY[a."tempDeviceId"]
FROM "AlarmSettings" AS a WHERE a."userId" = u.id AND a."tempDeviceId" IS NOT NULL;
