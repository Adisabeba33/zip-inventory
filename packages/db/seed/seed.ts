/**
 * Development seed.
 *
 * Everything here is invented. The dispensaries, addresses and menu items do
 * not describe any real licensee, and the only inventory source is a local
 * fixture file, so running the seed makes no outbound requests at all.
 *
 * The real directory path is the OCM importer (see docs/DATA-SOURCES.md); this
 * exists so the site, the diff engine and the admin screens can be exercised.
 */
import { closePool, query } from '../src/pool.js';
import { migrate } from '../src/migrate.js';
import * as dispensariesRepo from '../src/repositories/dispensaries.js';
import * as sourcesRepo from '../src/repositories/sources.js';
import * as legalRepo from '../src/repositories/legalNotices.js';
import * as zipRepo from '../src/repositories/zip.js';

const ZIPS = [
  { zip: '10605', city: 'White Plains', state: 'NY', latitude: 41.0067, longitude: -73.7629 },
  { zip: '10801', city: 'New Rochelle', state: 'NY', latitude: 40.9115, longitude: -73.7824 },
  { zip: '10701', city: 'Yonkers', state: 'NY', latitude: 40.9459, longitude: -73.8968 },
  { zip: '10001', city: 'New York', state: 'NY', latitude: 40.7506, longitude: -73.9971 },
  { zip: '10583', city: 'Scarsdale', state: 'NY', latitude: 40.9884, longitude: -73.8085 },
];

interface SeedDispensary {
  key: string;
  legalName: string;
  displayName: string;
  addressLine: string;
  city: string;
  zip: string;
  latitude: number;
  longitude: number;
  source: {
    url: string;
    domain: string;
    adapter: string;
    config: Record<string, unknown>;
    automationStatus: 'APPROVED' | 'EXPLICIT_PERMISSION' | 'API_LICENSED' | 'PENDING_REVIEW' | 'AUTOMATION_PROHIBITED';
    permissionType: string | null;
    permissionReference: string | null;
    reviewed: boolean;
    notes: string;
  };
}

const DISPENSARIES: SeedDispensary[] = [
  {
    key: 'northgate',
    legalName: 'Northgate Example Retail LLC',
    displayName: 'Northgate Example Dispensary',
    addressLine: '100 Example Avenue',
    city: 'White Plains',
    zip: '10605',
    latitude: 41.0201,
    longitude: -73.7629,
    source: {
      url: 'fixture://example-menu.json',
      domain: 'fixture.local',
      adapter: 'fixture',
      config: { file: 'example-menu.json', day: 0, brandPosition: 'prefix' },
      automationStatus: 'EXPLICIT_PERMISSION',
      permissionType: 'WRITTEN_PERMISSION',
      permissionReference: 'SEED-PERMISSION-0001 (fictional, for development only)',
      reviewed: true,
      notes: 'Local fixture source. No outbound requests.',
    },
  },
  {
    key: 'harborline',
    legalName: 'Harbor Line Example Retail LLC',
    displayName: 'Harbor Line Example Dispensary',
    addressLine: '42 Example Boulevard',
    city: 'New Rochelle',
    zip: '10801',
    latitude: 40.9115,
    longitude: -73.7824,
    source: {
      url: 'fixture://example-menu-small.json',
      domain: 'fixture.local',
      adapter: 'fixture',
      config: { file: 'example-menu-small.json', day: 0, brandPosition: 'prefix' },
      automationStatus: 'APPROVED',
      permissionType: 'PUBLIC_TERMS_REVIEW',
      permissionReference: null,
      reviewed: true,
      notes: 'Local fixture source. Seeded with an old last_success_at to demonstrate the stale state.',
    },
  },
  {
    key: 'riverbend',
    legalName: 'Riverbend Example Retail LLC',
    displayName: 'Riverbend Example Dispensary',
    addressLine: '7 Example Street',
    city: 'Yonkers',
    zip: '10701',
    latitude: 40.9459,
    longitude: -73.8968,
    source: {
      url: 'https://example.invalid/menu',
      domain: 'example.invalid',
      adapter: 'retailer-html',
      config: {},
      automationStatus: 'PENDING_REVIEW',
      permissionType: null,
      permissionReference: null,
      reviewed: false,
      notes: 'Awaiting source policy review. The crawler must not touch this.',
    },
  },
  {
    key: 'eastgate',
    legalName: 'Eastgate Example Retail LLC',
    displayName: 'Eastgate Example Dispensary',
    addressLine: '900 Example Road',
    city: 'New York',
    zip: '10001',
    latitude: 40.7506,
    longitude: -73.9971,
    source: {
      url: 'https://example.invalid/embedded-menu',
      domain: 'menu-platform.invalid',
      adapter: 'retailer-html',
      config: {},
      automationStatus: 'AUTOMATION_PROHIBITED',
      permissionType: 'NONE',
      permissionReference: null,
      reviewed: true,
      notes:
        'The menu on the retailer page is served by a third-party platform whose terms prohibit automated access. ' +
        'Directory listing only; no inventory.',
    },
  },
];

const LEGAL_COPY: Array<{ slot: Parameters<typeof legalRepo.upsertNotice>[0]; title: string; body: string }> = [
  {
    slot: 'site_footer',
    title: 'Independent inventory information only',
    body: [
      'Independent inventory information only. Not a retailer or marketplace.',
      'No cannabis sales or orders. No prices or promotions.',
      'Retail inventory can change at any time. 21+ where required by law.',
    ].join(' '),
  },
  {
    slot: 'dispensary_page',
    title: 'About this listing',
    body:
      'This is an independent inventory index. It is not affiliated with or endorsed by this retailer. ' +
      'Listings reflect items observed in an approved public or permitted inventory source at the stated check ' +
      'time and may differ from what the retailer actually holds. This service does not sell cannabis, process ' +
      'orders, display prices, or receive commissions from retailers.',
  },
  {
    slot: 'age_gate',
    title: 'Age confirmation',
    body:
      'This site contains information about legal adult-use cannabis inventory in New York. Are you 21 or older?',
  },
  {
    slot: 'part_129_disclosures',
    title: 'Regulatory disclosures',
    body:
      'Placeholder slot. If counsel determines that specific regulatory disclosures apply to this service, ' +
      'the wording is added here and appears site-wide without any code change.',
  },
];

async function seed(): Promise<void> {
  await migrate();
  const now = new Date();

  for (const centroid of ZIPS) await zipRepo.upsertZipCentroid(centroid);
  console.log(`[seed] ${ZIPS.length} ZIP centroids`);

  for (const entry of DISPENSARIES) {
    const dispensaryId = await dispensariesRepo.upsertFromDirectory(
      {
        ocmIdentifier: `SEED-${entry.key.toUpperCase()}`,
        legalName: entry.legalName,
        displayName: entry.displayName,
        addressLine: entry.addressLine,
        city: entry.city,
        state: 'NY',
        zip: entry.zip,
        latitude: entry.latitude,
        longitude: entry.longitude,
        officialWebsite: null,
        licenseStatus: 'SEED_EXAMPLE',
      },
      now,
    );

    const { rows } = await query<{ id: string }>(
      `INSERT INTO inventory_sources (
         dispensary_id, source_url, source_domain, source_owner, source_type, source_platform,
         parser_adapter, parser_config, automation_status, permission_type, permission_reference,
         allowed_frequency_hours, active, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,24,$12,$13)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        dispensaryId,
        entry.source.url,
        entry.source.domain,
        entry.displayName,
        entry.source.adapter === 'fixture' ? 'MANUAL' : 'RETAILER_WEBSITE',
        entry.source.adapter === 'fixture' ? 'fixture' : null,
        entry.source.adapter,
        JSON.stringify(entry.source.config),
        entry.source.automationStatus,
        entry.source.permissionType,
        entry.source.permissionReference,
        ['APPROVED', 'EXPLICIT_PERMISSION', 'API_LICENSED'].includes(entry.source.automationStatus),
        entry.source.notes,
      ],
    );

    const sourceId =
      rows[0]?.id ??
      (
        await query<{ id: string }>('SELECT id FROM inventory_sources WHERE dispensary_id = $1 LIMIT 1', [
          dispensaryId,
        ])
      ).rows[0]?.id;

    if (sourceId && entry.source.reviewed) {
      const allowed = ['APPROVED', 'EXPLICIT_PERMISSION', 'API_LICENSED'].includes(entry.source.automationStatus);
      await sourcesRepo.recordPolicyReview({
        sourceId,
        reviewedBy: 'seed',
        sourceOwnerDetermined: entry.displayName,
        termsUrl: entry.source.adapter === 'fixture' ? null : `${entry.source.url}/terms`,
        termsChecked: true,
        termsSummary: allowed
          ? 'Development fixture: no third-party terms apply.'
          : 'Menu is served by a third-party platform whose terms prohibit automated extraction.',
        robotsUrl: entry.source.adapter === 'fixture' ? null : `https://${entry.source.domain}/robots.txt`,
        robotsChecked: true,
        robotsSummary: allowed ? 'Not applicable to a local fixture.' : 'Not relied on; terms are dispositive here.',
        apiDocsUrl: null,
        automationAllowed: allowed,
        decision: allowed ? 'AUTOMATION_PERMITTED' : 'AUTOMATION_PROHIBITED',
        decisionRationale: entry.source.notes,
        permissionType: entry.source.permissionType,
        permissionReference: entry.source.permissionReference,
        allowedFrequencyHours: 24,
      });
    }
    console.log(`[seed] dispensary ${entry.displayName} (${entry.source.automationStatus})`);
  }

  for (const notice of LEGAL_COPY) {
    await legalRepo.upsertNotice(notice.slot, { title: notice.title, body: notice.body, variant: 'LEGAL' }, 'seed');
  }
  console.log(`[seed] ${LEGAL_COPY.length} legal notice slots`);

  console.log('\nNext: populate inventory from the local fixtures with');
  console.log('  npm run worker:cli -- seed-inventory');
}

seed()
  .then(() => closePool())
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
