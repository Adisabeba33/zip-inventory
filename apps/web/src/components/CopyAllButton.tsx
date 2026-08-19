'use client';

import { useEffect, useRef, useState } from 'react';

interface CopyAllButtonProps {
  strains: string[];
  label: string;
}

/**
 * One tap, one clipboard write: strain names, one per line.
 *
 * No prices, no links, no HTML, no attribution footer, no promotional text -
 * pasting the result somewhere else must produce exactly the list the visitor
 * was looking at.
 */
export function CopyAllButton({ strains, label }: CopyAllButtonProps) {
  const [status, setStatus] = useState<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const announce = (message: string) => {
    setStatus(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(''), 4000);
  };

  const copy = async () => {
    const text = strains.join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Older browsers and non-secure contexts.
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      announce(`${strains.length} strain ${strains.length === 1 ? 'name' : 'names'} copied`);
    } catch {
      announce('Could not reach the clipboard. Select the list and copy manually.');
    }
  };

  return (
    <div>
      <button type="button" className="primary" onClick={copy} disabled={strains.length === 0}>
        {label}
      </button>
      <span className="copy-status" role="status" aria-live="polite" style={{ marginLeft: '0.6rem' }}>
        {status}
      </span>
    </div>
  );
}
