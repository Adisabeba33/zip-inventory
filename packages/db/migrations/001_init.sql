-- ===========================================================================
-- Independent Dispensary Inventory Index - initial schema
--
-- Design notes that matter more than the DDL:
--
--  * We store facts, not other people's content. There is deliberately no
--    column anywhere for price, potency, product description, marketing copy,
--    photography or reviews. A field that does not exist cannot leak into an
--    API response, a cache or a backup.
--  * Raw fetched bodies live in raw_fetch_artifacts with a hard expiry. They
--    exist to debug a parser, not to archive a retailer's website.
--  * Every automated request is traceable to a source policy review that
--    permitted it.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- ZIP centroids. Used only to turn a typed ZIP into a search origin; we never
-- ask for or store a user's precise location.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zip_centroids (
  zip         text PRIMARY KEY CHECK (zip ~ '^[0-9]{5}$'),
  city        text,
  state       text NOT NULL,
  latitude    double precision NOT NULL,
  longitude   double precision NOT NULL,
  source      text NOT NULL DEFAULT 'us-census-gazetteer',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Dispensary directory. Canonical identity comes from the NY Office of
-- Cannabis Management directory, never from a mapping product and never from
-- a menu aggregator.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispensaries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable identity is OCM identifier + address + this UUID, never the name
  -- on its own: a retailer can rebrand without becoming a different licensee.
  ocm_identifier      text,
  identity_key        text NOT NULL UNIQUE,
  slug                text NOT NULL UNIQUE,
  legal_name          text NOT NULL,
  display_name        text NOT NULL,
  address_line        text,
  city                text,
  state               text NOT NULL DEFAULT 'NY',
  zip                 text,
  latitude            double precision,
  longitude           double precision,
  official_website    text,
  license_status      text,
  ocm_first_seen_at   timestamptz,
  ocm_last_seen_at    timestamptz,
  -- False once a licensee stops appearing in the active OCM directory. We keep
  -- the history and stop presenting inventory as current; we draw no
  -- conclusion about why.
  directory_active    boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dispensaries_ocm_identifier_key
  ON dispensaries (ocm_identifier) WHERE ocm_identifier IS NOT NULL;
CREATE INDEX IF NOT EXISTS dispensaries_zip_idx ON dispensaries (zip);
CREATE INDEX IF NOT EXISTS dispensaries_active_idx ON dispensaries (directory_active);
CREATE INDEX IF NOT EXISTS dispensaries_latlon_idx ON dispensaries (latitude, longitude);

-- --------------------------------------------------------------------------
-- Source registry. One row per place we might read inventory from, with the
-- legal status of that access attached to the row itself.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_sources (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensary_id          uuid NOT NULL REFERENCES dispensaries (id) ON DELETE CASCADE,
  source_url             text NOT NULL,
  source_domain          text NOT NULL,
  -- Who actually owns the endpoint. A retailer page that embeds a third-party
  -- menu widget is that third party's source, and needs its own review.
  source_owner           text,
  source_type            text NOT NULL DEFAULT 'RETAILER_WEBSITE'
                           CHECK (source_type IN ('RETAILER_API','RETAILER_WEBSITE','DIRECT_FEED','THIRD_PARTY_PLATFORM','MANUAL')),
  source_platform        text,
  terms_url              text,
  robots_url             text,
  terms_reviewed_at      timestamptz,
  robots_reviewed_at     timestamptz,
  automation_status      text NOT NULL DEFAULT 'PENDING_REVIEW'
                           CHECK (automation_status IN ('PENDING_REVIEW','APPROVED','EXPLICIT_PERMISSION','API_LICENSED','AUTOMATION_PROHIBITED','PAUSED','LEGAL_HOLD')),
  permission_type        text CHECK (permission_type IN ('NONE','PUBLIC_TERMS_REVIEW','WRITTEN_PERMISSION','API_AGREEMENT','DIRECT_FEED_AGREEMENT')),
  permission_reference   text,
  allowed_frequency_hours integer NOT NULL DEFAULT 24 CHECK (allowed_frequency_hours >= 1),
  parser_adapter         text NOT NULL DEFAULT 'unassigned',
  parser_config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  active                 boolean NOT NULL DEFAULT false,
  last_success_at        timestamptz,
  last_failure_at        timestamptz,
  last_attempt_at        timestamptz,
  consecutive_failures   integer NOT NULL DEFAULT 0,
  next_review_due_at     timestamptz,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_sources_dispensary_idx ON inventory_sources (dispensary_id);
CREATE INDEX IF NOT EXISTS inventory_sources_status_idx ON inventory_sources (automation_status, active);

-- Legal audit trail: why automation against this source was ever permitted.
CREATE TABLE IF NOT EXISTS source_policy_reviews (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id               uuid NOT NULL REFERENCES inventory_sources (id) ON DELETE CASCADE,
  reviewed_at             timestamptz NOT NULL DEFAULT now(),
  reviewed_by             text NOT NULL,
  source_owner_determined text,
  terms_url               text,
  terms_checked           boolean NOT NULL DEFAULT false,
  terms_summary           text,
  robots_url              text,
  robots_checked          boolean NOT NULL DEFAULT false,
  robots_summary          text,
  api_docs_url            text,
  automation_allowed      boolean NOT NULL,
  decision                text NOT NULL,
  decision_rationale      text NOT NULL,
  permission_type         text,
  permission_reference    text,
  allowed_frequency_hours integer,
  next_review_due_at      timestamptz NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_policy_reviews_source_idx ON source_policy_reviews (source_id, reviewed_at DESC);

-- --------------------------------------------------------------------------
-- Crawl runs. Every attempt is recorded, including the ones the gate refused,
-- so "did we ever request this URL, and under what authority" is answerable.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crawl_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id            uuid NOT NULL REFERENCES inventory_sources (id) ON DELETE CASCADE,
  dispensary_id        uuid NOT NULL REFERENCES dispensaries (id) ON DELETE CASCADE,
  started_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz,
  status               text NOT NULL DEFAULT 'RUNNING'
                         CHECK (status IN ('RUNNING','SUCCESS','FAILED','BLOCKED','NEEDS_CONFIRMATION','SKIPPED')),
  gate_allowed         boolean NOT NULL,
  gate_reason          text NOT NULL,
  policy_review_id     uuid REFERENCES source_policy_reviews (id) ON DELETE SET NULL,
  http_status          integer,
  pages_requested      integer NOT NULL DEFAULT 0,
  raw_item_count       integer NOT NULL DEFAULT 0,
  parsed_item_count    integer NOT NULL DEFAULT 0,
  accepted_item_count  integer NOT NULL DEFAULT 0,
  rejected_item_count  integer NOT NULL DEFAULT 0,
  checksum             text,
  previous_checksum    text,
  anomaly_score        double precision,
  anomaly_reason       text,
  parser_version       text,
  error_code           text,
  error_message        text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crawl_runs_source_idx ON crawl_runs (source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS crawl_runs_status_idx ON crawl_runs (status, started_at DESC);

-- Raw bodies, kept briefly for parser debugging and then purged. This is not
-- an archive of anybody's website.
CREATE TABLE IF NOT EXISTS raw_fetch_artifacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_run_id  uuid NOT NULL REFERENCES crawl_runs (id) ON DELETE CASCADE,
  url           text NOT NULL,
  content_hash  text NOT NULL,
  byte_size     integer NOT NULL,
  body          text,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  purged_at     timestamptz
);

CREATE INDEX IF NOT EXISTS raw_fetch_artifacts_expiry_idx ON raw_fetch_artifacts (expires_at) WHERE purged_at IS NULL;

-- --------------------------------------------------------------------------
-- Snapshots and observations.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensary_id  uuid NOT NULL REFERENCES dispensaries (id) ON DELETE CASCADE,
  source_id      uuid NOT NULL REFERENCES inventory_sources (id) ON DELETE CASCADE,
  crawl_run_id   uuid NOT NULL REFERENCES crawl_runs (id) ON DELETE CASCADE,
  observed_at    timestamptz NOT NULL,
  successful     boolean NOT NULL,
  item_count     integer NOT NULL DEFAULT 0,
  hash           text NOT NULL,
  parser_version text NOT NULL,
  -- A snapshot is only allowed to move public state once published is true.
  published      boolean NOT NULL DEFAULT false,
  published_at   timestamptz,
  anomaly_flag   boolean NOT NULL DEFAULT false,
  anomaly_reason text,
  review_state   text NOT NULL DEFAULT 'ACCEPTED'
                   CHECK (review_state IN ('ACCEPTED','NEEDS_CONFIRMATION','REJECTED')),
  reviewed_by    text,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_snapshots_dispensary_idx
  ON inventory_snapshots (dispensary_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS inventory_snapshots_published_idx
  ON inventory_snapshots (dispensary_id, published, observed_at DESC);

CREATE TABLE IF NOT EXISTS inventory_observations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_run_id    uuid NOT NULL REFERENCES crawl_runs (id) ON DELETE CASCADE,
  snapshot_id     uuid REFERENCES inventory_snapshots (id) ON DELETE CASCADE,
  dispensary_id   uuid NOT NULL REFERENCES dispensaries (id) ON DELETE CASCADE,
  source_item_id  text,
  raw_name        text NOT NULL,
  canonical_name  text NOT NULL,
  match_key       text NOT NULL,
  raw_weight      text,
  canonical_weight text NOT NULL
                    CHECK (canonical_weight IN ('EIGHTH','QUARTER','HALF','OUNCE','UNCLASSIFIED_WEIGHT')),
  product_type    text NOT NULL CHECK (product_type IN ('FLOWER','EXCLUDED')),
  flower_subtype  text NOT NULL DEFAULT 'UNSPECIFIED'
                    CHECK (flower_subtype IN ('WHOLE_FLOWER','SMALLS','GROUND','UNSPECIFIED')),
  name_confident  boolean NOT NULL DEFAULT true,
  first_seen_at   timestamptz,
  observed_at     timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS inventory_observations_run_idx ON inventory_observations (crawl_run_id);
CREATE INDEX IF NOT EXISTS inventory_observations_snapshot_idx ON inventory_observations (snapshot_id);

-- --------------------------------------------------------------------------
-- Canonical published inventory: one row per dispensary + cultivar + size.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensary_id         uuid NOT NULL REFERENCES dispensaries (id) ON DELETE CASCADE,
  canonical_strain_name text NOT NULL,
  match_key             text NOT NULL,
  package_weight        text NOT NULL CHECK (package_weight IN ('EIGHTH','QUARTER','HALF','OUNCE')),
  current_status        text NOT NULL
                          CHECK (current_status IN ('LISTED_NOW','NEWLY_LISTED','NO_LONGER_LISTED','RETURNED','UNKNOWN','STALE')),
  first_seen_at         timestamptz NOT NULL,
  last_seen_at          timestamptz,
  last_missing_at       timestamptz,
  returned_at           timestamptz,
  consecutive_hits      integer NOT NULL DEFAULT 0,
  consecutive_misses    integer NOT NULL DEFAULT 0,
  listing_count         integer NOT NULL DEFAULT 1,
  last_snapshot_id      uuid REFERENCES inventory_snapshots (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_entries_identity UNIQUE (dispensary_id, package_weight, match_key)
);

CREATE INDEX IF NOT EXISTS inventory_entries_current_idx
  ON inventory_entries (dispensary_id, package_weight, current_status);
CREATE INDEX IF NOT EXISTS inventory_entries_changes_idx
  ON inventory_entries (dispensary_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS snapshot_entries (
  snapshot_id           uuid NOT NULL REFERENCES inventory_snapshots (id) ON DELETE CASCADE,
  inventory_entry_id    uuid NOT NULL REFERENCES inventory_entries (id) ON DELETE CASCADE,
  canonical_strain_name text NOT NULL,
  package_weight        text NOT NULL CHECK (package_weight IN ('EIGHTH','QUARTER','HALF','OUNCE')),
  listing_count         integer NOT NULL DEFAULT 1,
  PRIMARY KEY (snapshot_id, inventory_entry_id)
);

-- --------------------------------------------------------------------------
-- Strain aliases. Rows exist as suggestions; only manually_verified rows are
-- ever applied to public output.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS strain_aliases (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias              text NOT NULL,
  alias_key          text NOT NULL,
  canonical_name     text NOT NULL,
  confidence         double precision NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  source             text NOT NULL DEFAULT 'manual',
  manually_verified  boolean NOT NULL DEFAULT false,
  verified_by        text,
  verified_at        timestamptz,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strain_aliases_alias_key UNIQUE (alias_key)
);

CREATE INDEX IF NOT EXISTS strain_aliases_verified_idx ON strain_aliases (manually_verified);

-- --------------------------------------------------------------------------
-- Corrections. Public submissions never touch production data directly.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS corrections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensary_id  uuid REFERENCES dispensaries (id) ON DELETE SET NULL,
  dispensary_text text,
  issue_type     text NOT NULL
                   CHECK (issue_type IN ('WRONG_STRAIN','WRONG_WEIGHT','STALE_INVENTORY','WRONG_ADDRESS','DUPLICATE_STRAIN','CRAWLER_OPT_OUT','OTHER')),
  details        text NOT NULL,
  -- Optional and only used to reply about this report.
  contact_email  text,
  status         text NOT NULL DEFAULT 'OPEN'
                   CHECK (status IN ('OPEN','IN_REVIEW','ACTIONED','DISMISSED')),
  resolution     text,
  reviewed_by    text,
  reviewed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS corrections_status_idx ON corrections (status, created_at DESC);

-- --------------------------------------------------------------------------
-- Review queue for anything the parser refused to guess at.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text NOT NULL
                   CHECK (kind IN ('UNCLASSIFIED_WEIGHT','LOW_CONFIDENCE_NAME','ANOMALY','SOURCE_FAILURE','ALIAS_SUGGESTION')),
  dispensary_id  uuid REFERENCES dispensaries (id) ON DELETE CASCADE,
  source_id      uuid REFERENCES inventory_sources (id) ON DELETE CASCADE,
  crawl_run_id   uuid REFERENCES crawl_runs (id) ON DELETE CASCADE,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
  resolved_by    text,
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_queue_open_idx ON review_queue (status, kind, created_at DESC);

-- --------------------------------------------------------------------------
-- Admin audit log.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           bigserial PRIMARY KEY,
  actor        text NOT NULL,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    text,
  before_state jsonb,
  after_state  jsonb,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id, created_at DESC);

-- --------------------------------------------------------------------------
-- Editable legal copy. Regulatory wording is configuration, not code, so
-- counsel can change it without a redesign or a deploy.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legal_notices (
  slot        text PRIMARY KEY,
  title       text,
  body        text NOT NULL,
  variant     text NOT NULL DEFAULT 'NEUTRAL' CHECK (variant IN ('NEUTRAL','WARNING','LEGAL')),
  enabled     boolean NOT NULL DEFAULT true,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
