-- AlterTable
ALTER TABLE "AlarmSettings" ADD COLUMN     "callOnTrigger" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phoneNumber" TEXT;
