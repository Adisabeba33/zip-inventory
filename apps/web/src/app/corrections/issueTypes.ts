export const ISSUE_TYPES = [
  { value: 'WRONG_STRAIN', label: 'A strain name is wrong' },
  { value: 'WRONG_WEIGHT', label: 'A package size is wrong' },
  { value: 'DUPLICATE_STRAIN', label: 'The same strain is listed twice' },
  { value: 'STALE_INVENTORY', label: 'The inventory is out of date' },
  { value: 'WRONG_ADDRESS', label: 'A retailer address or detail is wrong' },
  { value: 'CRAWLER_OPT_OUT', label: 'I own this source and want the crawler to stop' },
  { value: 'OTHER', label: 'Something else' },
] as const;
