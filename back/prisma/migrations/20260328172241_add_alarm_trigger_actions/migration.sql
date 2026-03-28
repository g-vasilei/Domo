-- CreateTable
CREATE TABLE "AlarmTriggerAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "statusCode" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlarmTriggerAction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AlarmTriggerAction" ADD CONSTRAINT "AlarmTriggerAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
