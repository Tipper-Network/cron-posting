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

/** Beirut wall time as YYYY-MM-DD HH:mm. */
export function beirutStamp(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
}

/** Only status=scheduled on or before today. Approved stays parked. */
export function isDue(row: CatalogRow, today = beirutToday()): boolean {
  if ((row.status || '').toLowerCase() !== 'scheduled') return false;
  const date = (row.scheduled_date || '').trim();
  return Boolean(date) && date <= today;
}

/** Oldest scheduled_date, then publish_order. One row per tick. */
export function nextDue(rows: CatalogRow[], today = beirutToday()): CatalogRow | undefined {
  return rows
    .filter((row) => isDue(row, today))
    .sort((a, b) => {
      const byDate = (a.scheduled_date || '').localeCompare(b.scheduled_date || '');
      if (byDate !== 0) return byDate;
      return Number(a.publish_order || 0) - Number(b.publish_order || 0);
    })[0];
}
