export type CatalogRow = Record<string, string>;

/** Beirut calendar date as YYYY-MM-DD. */
export function beirutToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Only status=scheduled on or before today. Approved stays parked. */
export function isDue(row: CatalogRow, today = beirutToday()): boolean {
  if ((row.status || '').toLowerCase() !== 'scheduled') return false;
  const date = (row.scheduled_date || '').trim();
  return Boolean(date) && date <= today;
}
