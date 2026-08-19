-- ---------------------------------------------------------------------------
-- Accepting a held snapshot has to actually let the next observation through.
--
-- Without this, an admin who confirms that a retailer really did remove most of
-- its listings would see the next run blocked by the same anomaly rule, because
-- the comparison baseline is still the old published snapshot. An override is a
-- one-shot, audited permission to publish past the anomaly gate once.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anomaly_overrides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensary_id  uuid NOT NULL REFERENCES dispensaries (id) ON DELETE CASCADE,
  snapshot_id    uuid REFERENCES inventory_snapshots (id) ON DELETE SET NULL,
  created_by     text NOT NULL,
  reason         text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Set when a run uses it. An override is good for exactly one publication.
  consumed_at    timestamptz,
  consumed_run_id uuid REFERENCES crawl_runs (id) ON DELETE SET NULL,
  -- An unused override expires rather than lingering indefinitely.
  expires_at     timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS anomaly_overrides_open_idx
  ON anomaly_overrides (dispensary_id, expires_at) WHERE consumed_at IS NULL;
