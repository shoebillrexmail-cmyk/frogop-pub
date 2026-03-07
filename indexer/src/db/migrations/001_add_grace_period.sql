-- Add per-pool grace period column (default 144 = ~24h)
ALTER TABLE pools ADD COLUMN grace_period_blocks INTEGER NOT NULL DEFAULT 144;
