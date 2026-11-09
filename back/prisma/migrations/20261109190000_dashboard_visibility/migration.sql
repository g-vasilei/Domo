ALTER TABLE "User"
  ADD COLUMN "dashboardHiddenCards" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "dashboardHiddenSections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
