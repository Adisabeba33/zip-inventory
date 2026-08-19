'use client';

import { useActionState } from 'react';
import { submitCorrection, type CorrectionState } from './actions';
import { ISSUE_TYPES } from './issueTypes';

const INITIAL: CorrectionState = { status: 'idle', message: '' };

export function CorrectionForm({ dispensaries }: { dispensaries: Array<{ slug: string; name: string }> }) {
  const [state, action, pending] = useActionState(submitCorrection, INITIAL);

  if (state.status === 'ok') {
    return <div className="notice">{state.message}</div>;
  }

  return (
    <form action={action} className="stack" style={{ maxWidth: '34rem' }}>
      {state.status === 'error' ? (
        <div className="notice notice--warning" role="alert">
          {state.message}
        </div>
      ) : null}

      <div>
        <label htmlFor="dispensary">Retailer (optional)</label>
        <select id="dispensary" name="dispensary" defaultValue="">
          <option value="">Not about a specific retailer</option>
          {dispensaries.map((entry) => (
            <option key={entry.slug} value={entry.slug}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="issueType">Issue</label>
        <select id="issueType" name="issueType" required defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {ISSUE_TYPES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="details">Details</label>
        <textarea id="details" name="details" required minLength={10} maxLength={4000} />
      </div>

      <div>
        <label htmlFor="contactEmail">Email (optional)</label>
        <input id="contactEmail" name="contactEmail" type="email" autoComplete="email" />
        <p className="small faint" style={{ marginTop: '0.3rem' }}>
          Only used to reply about this report. Leave it blank if you would rather not.
        </p>
      </div>

      <div>
        <button type="submit" className="primary" disabled={pending}>
          {pending ? 'Sending…' : 'Send report'}
        </button>
      </div>
    </form>
  );
}
