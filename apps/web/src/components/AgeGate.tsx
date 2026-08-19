'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'inventory-index.age-confirmed';

interface AgeGateProps {
  enabled: boolean;
  title: string;
  body: string;
}

/**
 * The 21+ interstitial.
 *
 * It asks one yes/no question and stores one boolean locally. It does not
 * collect a date of birth, a name or anything else, because it does not need
 * to, and because collecting it would create a record worth protecting.
 *
 * Whether it appears at all is a deployment flag, so counsel can set the final
 * mode without a code change.
 */
export function AgeGate({ enabled, title, body }: AgeGateProps) {
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) {
      setConfirmed(true);
      return;
    }
    try {
      setConfirmed(window.localStorage.getItem(STORAGE_KEY) === 'yes');
    } catch {
      setConfirmed(false);
    }
  }, [enabled]);

  if (!enabled || confirmed === null || confirmed) return null;

  const accept = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'yes');
    } catch {
      // A browser that refuses storage simply asks again next visit.
    }
    setConfirmed(true);
  };

  return (
    <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
      <div className="age-gate__panel">
        <h1 id="age-gate-title">{title}</h1>
        <p className="muted">{body}</p>
        <div className="age-gate__actions">
          <button type="button" className="primary" onClick={accept}>
            Yes, I am 21 or older
          </button>
          <a className="button" href="https://www.ny.gov/">
            No, take me away
          </a>
        </div>
        <p className="small faint" style={{ marginTop: '1.25rem' }}>
          We do not ask for or store your date of birth. Your answer is kept in this browser only.
        </p>
      </div>
    </div>
  );
}
