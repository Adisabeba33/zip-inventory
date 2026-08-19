-- ---------------------------------------------------------------------------
-- One source row per (dispensary, URL).
--
-- Without this, an importer or a re-run of the seed can insert the same
-- endpoint twice for one retailer. That is not just untidy: the scheduler would
-- then observe the same URL twice a day, doubling our request rate against a
-- source whose allowed frequency we promised to respect, and the two rows could
-- disagree about whether automation is permitted at all.
-- ---------------------------------------------------------------------------

-- Collapse any duplicates that already exist, keeping the oldest row (the one
-- the policy reviews and crawl runs point at).
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY dispensary_id, source_url ORDER BY created_at, id) AS position
    FROM inventory_sources
)
DELETE FROM inventory_sources
 WHERE id IN (SELECT id FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_sources_dispensary_url_key
  ON inventory_sources (dispensary_id, source_url);
