import Link from 'next/link';
import type { CanonicalWeight } from '@inventory-index/core';

export interface WeightTabItem {
  weight: CanonicalWeight;
  ounceLabel: string;
  gramLabel: string;
  slug: string;
  count: number;
}

/**
 * The four canonical package sizes, always in the same order, always all four
 * shown even at zero, so the shape of the page never depends on what a
 * retailer happens to list today.
 */
export function WeightTabs({
  items,
  activeSlug,
  basePath,
}: {
  items: WeightTabItem[];
  activeSlug: string;
  basePath: string;
}) {
  return (
    <ul className="weight-tabs">
      {items.map((item) => (
        <li key={item.weight}>
          <Link
            className="weight-tab"
            href={`${basePath}?w=${item.slug}`}
            aria-current={item.slug === activeSlug ? 'true' : undefined}
            scroll={false}
          >
            <span className="weight-tab__label">{item.ounceLabel}</span>
            <span className="weight-tab__grams">{item.gramLabel}</span>
            <span className="weight-tab__count">{item.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
