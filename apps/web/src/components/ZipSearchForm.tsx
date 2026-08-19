import { RADIUS_OPTIONS_MILES } from '@inventory-index/core';

interface ZipSearchFormProps {
  defaultZip?: string;
  defaultRadius?: number;
  autoFocus?: boolean;
}

/**
 * A plain GET form. A ZIP code is enough to find a retailer, so the site never
 * asks for location permission or a precise position, and nothing about the
 * search is tied to a visitor.
 */
export function ZipSearchForm({ defaultZip = '', defaultRadius, autoFocus }: ZipSearchFormProps) {
  return (
    <form action="/search" method="get" className="search-row">
      <div className="field">
        <label htmlFor="zip">ZIP code</label>
        <input
          id="zip"
          name="zip"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{5}"
          maxLength={10}
          placeholder="10605"
          defaultValue={defaultZip}
          autoFocus={autoFocus}
          autoComplete="postal-code"
          required
        />
      </div>
      <div className="field" style={{ flex: '0 1 9rem' }}>
        <label htmlFor="radius">Within</label>
        <select id="radius" name="radius" defaultValue={String(defaultRadius ?? 10)}>
          {RADIUS_OPTIONS_MILES.map((miles) => (
            <option key={miles} value={miles}>
              {miles} miles
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="primary">
        Find dispensaries
      </button>
    </form>
  );
}
