ALTER TABLE "User"
  ADD COLUMN "dashboardCardOrder" TEXT[] NOT NULL DEFAULT ARRAY['alarm', 'weather', 'temperature']::TEXT[],
  ADD COLUMN "dashboardSectionOrder" TEXT[] NOT NULL DEFAULT ARRAY['overview', 'devices', 'stats', 'health']::TEXT[];
