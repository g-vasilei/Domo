-- CreateTable
CREATE TABLE "DeviceNotifPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DeviceNotifPref_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceNotifPref_userId_deviceId_key" ON "DeviceNotifPref"("userId", "deviceId");

-- AddForeignKey
ALTER TABLE "DeviceNotifPref" ADD CONSTRAINT "DeviceNotifPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
