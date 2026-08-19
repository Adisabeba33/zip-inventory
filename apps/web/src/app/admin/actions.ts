'use server';

import { revalidatePath } from 'next/cache';
import {
  aliases,
  corrections,
  reviewQueue,
  legalNotices,
  snapshots,
  sources,
} from '@inventory-index/db';
import { adminActor, requireAdmin } from '@/lib/admin';

/**
 * Admin mutations.
 *
 * All of them re-check authorisation, and all of them write to the audit log
 * through the repositories - there is no path that changes crawler authority
 * or public copy without leaving a record of who did it and why.
 */

export async function recordPolicyReviewAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const sourceId = String(formData.get('sourceId') ?? '');
  const automationAllowed = formData.get('automationAllowed') === 'yes';

  await sources.recordPolicyReview({
    sourceId,
    reviewedBy: adminActor(),
    sourceOwnerDetermined: String(formData.get('sourceOwner') ?? '') || null,
    termsUrl: String(formData.get('termsUrl') ?? '') || null,
    termsChecked: formData.get('termsChecked') === 'on',
    termsSummary: String(formData.get('termsSummary') ?? '') || null,
    robotsUrl: String(formData.get('robotsUrl') ?? '') || null,
    robotsChecked: formData.get('robotsChecked') === 'on',
    robotsSummary: String(formData.get('robotsSummary') ?? '') || null,
    apiDocsUrl: String(formData.get('apiDocsUrl') ?? '') || null,
    automationAllowed,
    decision: automationAllowed ? 'AUTOMATION_PERMITTED' : 'AUTOMATION_PROHIBITED',
    decisionRationale: String(formData.get('rationale') ?? '').trim() || 'No rationale recorded.',
    permissionType: String(formData.get('permissionType') ?? '') || null,
    permissionReference: String(formData.get('permissionReference') ?? '') || null,
    allowedFrequencyHours: Math.max(1, Number.parseInt(String(formData.get('frequencyHours') ?? '24'), 10) || 24),
  });

  revalidatePath(`/admin/sources/${sourceId}`);
  revalidatePath('/admin/sources');
}

export async function enableAutomationAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const sourceId = String(formData.get('sourceId') ?? '');
  const status = String(formData.get('status') ?? 'APPROVED') as
    | 'APPROVED'
    | 'EXPLICIT_PERMISSION'
    | 'API_LICENSED';

  // Refuses unless a current review on file permits automation.
  await sources.enableAutomation(sourceId, status, adminActor());
  revalidatePath(`/admin/sources/${sourceId}`);
  revalidatePath('/admin/sources');
}

export async function setAutomationStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const sourceId = String(formData.get('sourceId') ?? '');
  const status = String(formData.get('status') ?? 'PAUSED') as never;
  const reason = String(formData.get('reason') ?? '').trim() || 'Changed from the admin dashboard.';

  await sources.setAutomationStatus(sourceId, status, adminActor(), reason);
  revalidatePath(`/admin/sources/${sourceId}`);
  revalidatePath('/admin/sources');
}

export async function reviewSnapshotAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const snapshotId = String(formData.get('snapshotId') ?? '');
  const accepted = formData.get('decision') === 'accept';
  const reason = String(formData.get('reason') ?? '').trim() || 'Reviewed from the admin dashboard.';

  if (accepted) {
    // Also issues a one-shot override so the next successful observation may
    // publish past the anomaly gate.
    await snapshots.acceptAnomaly(snapshotId, adminActor(), reason);
  } else {
    await snapshots.markReviewed(snapshotId, 'REJECTED', adminActor(), reason);
  }
  revalidatePath('/admin/anomalies');
}

export async function verifyAliasAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('aliasId') ?? '');
  const notes = String(formData.get('notes') ?? '') || undefined;

  if (formData.get('decision') === 'unverify') {
    await aliases.unverifyAlias(id, adminActor(), notes ?? 'Merge withdrawn.');
  } else {
    await aliases.verifyAlias(id, adminActor(), notes);
  }
  revalidatePath('/admin/aliases');
}

export async function suggestAliasAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const alias = String(formData.get('alias') ?? '').trim();
  const canonicalName = String(formData.get('canonicalName') ?? '').trim();
  if (!alias || !canonicalName) return;

  // Added unverified: a merge only reaches the public site after a human
  // verifies it here.
  await aliases.suggestAlias({
    alias,
    canonicalName,
    confidence: 0.5,
    source: 'admin',
    notes: String(formData.get('notes') ?? '') || undefined,
  });
  revalidatePath('/admin/aliases');
}

export async function resolveCorrectionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('correctionId') ?? '');
  const status = String(formData.get('status') ?? 'IN_REVIEW') as never;
  const resolution = String(formData.get('resolution') ?? '').trim() || 'Reviewed.';

  await corrections.resolveCorrection(id, status, adminActor(), resolution);
  revalidatePath('/admin/corrections');
}

export async function resolveReviewAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('reviewId') ?? '');
  const status = formData.get('decision') === 'dismiss' ? 'DISMISSED' : 'RESOLVED';

  await reviewQueue.resolveReview(id, status, adminActor(), String(formData.get('reason') ?? '') || 'Handled.');
  revalidatePath('/admin/reviews');
}

export async function updateLegalNoticeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const slot = String(formData.get('slot') ?? '') as never;
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return;

  await legalNotices.upsertNotice(
    slot,
    {
      title: String(formData.get('title') ?? '') || null,
      body,
      variant: (String(formData.get('variant') ?? 'LEGAL') as 'NEUTRAL' | 'WARNING' | 'LEGAL'),
      enabled: formData.get('enabled') === 'on',
    },
    adminActor(),
  );

  // Legal copy appears site-wide, so every cached page is invalidated.
  revalidatePath('/', 'layout');
  revalidatePath('/admin/legal');
}
