'use client';

import { useEffect, useState } from 'react';
import { WEIGHT_PRESENTATION, parseMenuLines, type CanonicalWeight } from '@inventory-index/core/browser';

const WEIGHTS: CanonicalWeight[] = ['EIGHTH', 'QUARTER', 'HALF', 'OUNCE'];

interface Row {
  name: string;
  weight: CanonicalWeight;
  listings: number;
}

/**
 * The share target.
 *
 * Whatever hands over menu text - a share extension, a shortcut, a paste -
 * lands here. Parsing runs in the page, so the text is not sent anywhere just
 * to be read, and the reader picks what to keep before anything is added.
 */
export function AddForm({ initialText }: { initialText: string }) {
  const [text, setText] = useState(initialText);
  const [parsed, setParsed] = useState<ReturnType<typeof parseMenuLines> | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('');

  const parse = (value: string) => {
    const result = parseMenuLines(value.split(/\r?\n/));
    setParsed(result);
    // Everything found starts selected; unticking is faster than ticking.
    setChosen(new Set(result.entries.map((entry) => entry.key)));
  };

  useEffect(() => {
    if (initialText.trim()) parse(initialText);
    // Parsing the handed-over text once on arrival is the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);

  const rows: Row[] = (parsed?.entries ?? [])
    .filter((entry) => chosen.has(entry.key))
    .map((entry) => ({ name: entry.canonicalName, weight: entry.packageWeight, listings: entry.listingCount }));

  const toggle = (key: string) => {
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copy = async () => {
    const names = rows.map((row) => row.name);
    try {
      await navigator.clipboard.writeText(names.join('\n'));
      setStatus(`${names.length} ${names.length === 1 ? 'name' : 'names'} copied`);
    } catch {
      setStatus('Clipboard unavailable — select the list and copy by hand.');
    }
    setTimeout(() => setStatus(''), 4000);
  };

  return (
    <div className="stack">
      <div>
        <label htmlFor="text">Menu text</label>
        <textarea
          id="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste a menu, or arrive here from a share sheet with the text already filled in."
          style={{ minHeight: '9rem', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
        />
      </div>

      <div className="search-row">
        <button type="button" className="primary" onClick={() => parse(text)} disabled={!text.trim()}>
          Read strains
        </button>
        <button type="button" onClick={() => { setText(''); setParsed(null); }}>
          Clear
        </button>
      </div>

      {parsed ? (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            {parsed.lineCount} lines read · {parsed.entries.length} strains found · {rows.length} selected
          </p>

          {WEIGHTS.map((weight) => {
            const entries = parsed.entries.filter((entry) => entry.packageWeight === weight);
            if (entries.length === 0) return null;
            const presentation = WEIGHT_PRESENTATION[weight];
            return (
              <section key={weight}>
                <h2 className="list-header__title">
                  {presentation.ounceLabel} — {presentation.gramLabel} · {entries.length}
                </h2>
                <ul className="strain-list">
                  {entries.map((entry) => (
                    <li className="strain" key={entry.key}>
                      <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', margin: 0, flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={chosen.has(entry.key)}
                          onChange={() => toggle(entry.key)}
                          style={{ width: 'auto' }}
                        />
                        <span className="strain__name" style={{ color: 'var(--text)' }}>
                          {entry.canonicalName}
                        </span>
                      </label>
                      {entry.listingCount > 1 ? <span className="badge">{entry.listingCount}×</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <div className="search-row">
            <button type="button" className="primary" onClick={copy} disabled={rows.length === 0}>
              Copy {rows.length} selected
            </button>
            <span className="copy-status" role="status" aria-live="polite">{status}</span>
          </div>

          {parsed.skipped.length > 0 ? (
            <details className="card">
              <summary className="small">Set aside — {parsed.skipped.length} lines</summary>
              <p className="small faint">
                Not dropped quietly. A line lands here when it is not flower, has no standard package size, or the
                size was ambiguous.
              </p>
              <ul className="strain-list">
                {parsed.skipped.slice(0, 200).map((item, index) => (
                  <li className="strain small" key={`${item.line}-${index}`}>
                    <span className="strain__name">{item.line}</span>
                    <span className="faint nowrap">{item.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
