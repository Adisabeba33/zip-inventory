'use server';

import { corrections, dispensaries } from '@inventory-index/db';
import { ISSUE_TYPES } from './issueTypes';

export interface CorrectionState {
  status: 'idle' | 'ok' | 'error';
  message: string;
}

/**
 * Public submissions are queued for admin review and never touch published
 * data. Nobody outside the admin can change what the site shows.
 */
export async function submitCorrection(
  _previous: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const issueType = String(formData.get('issueType') ?? '');
  const details = String(formData.get('details') ?? '').trim();
  const dispensarySlug = String(formData.get('dispensary') ?? '').trim();
  const contactEmail = String(formData.get('contactEmail') ?? '').trim();

  if (!ISSUE_TYPES.some((entry) => entry.value === issueType)) {
    return { status: 'error', message: 'Choose the kind of issue you are reporting.' };
  }
  if (details.length < 10) {
    return { status: 'error', message: 'Please describe the problem in a sentence or two.' };
  }
  if (details.length > 4000) {
    return { status: 'error', message: 'Please keep the description under 4000 characters.' };
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { status: 'error', message: 'That email address does not look right. You can also leave it blank.' };
  }

  let dispensaryId: string | null = null;
  if (dispensarySlug) {
    const row = await dispensaries.getBySlug(dispensarySlug);
    dispensaryId = row?.id ?? null;
  }

  await corrections.submitCorrection({
    dispensaryId,
    dispensaryText: dispensarySlug || null,
    issueType: issueType as never,
    details,
    contactEmail: contactEmail || null,
  });

  return {
    status: 'ok',
    message:
      'Thank you. This has been queued for review. Reports are read by a person; nothing changes on the site automatically.',
  };
}
