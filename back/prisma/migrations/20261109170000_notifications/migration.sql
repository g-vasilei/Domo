CREATE TABLE "AppNotification" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT NOT NULL, "state" TEXT,
 "deviceId" TEXT, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "read" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX "AppNotification_userId_at_idx" ON "AppNotification"("userId", "at");
CREATE TABLE "PushSubscription" (
 "endpoint" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL
);
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
CREATE TABLE "PushKey" ("id" TEXT PRIMARY KEY, "publicKey" TEXT NOT NULL, "privateKey" TEXT NOT NULL);
