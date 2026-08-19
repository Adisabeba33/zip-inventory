import { getLegalNotice } from '@/lib/legal';

interface LegalNoticeProps {
  slot: string;
  className?: string;
}

/**
 * Renders one configurable legal slot.
 *
 * Regulatory wording is never hard-coded into a page. If counsel determines
 * that a particular disclosure applies to this service, it is added to the slot
 * and appears everywhere the slot is used, with no redesign.
 */
export async function LegalNotice({ slot, className }: LegalNoticeProps) {
  const notice = await getLegalNotice(slot);
  if (!notice) return null;

  return (
    <aside className={className ?? 'notice'}>
      {notice.title ? <strong>{notice.title}. </strong> : null}
      {notice.body}
    </aside>
  );
}
