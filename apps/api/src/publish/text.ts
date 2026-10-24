import { CatalogRow } from '../schedule/due';

export function rowLabel(row: CatalogRow): string {
  return [row.entity, row.series, row.id].filter(Boolean).join('/') || `row ${row.sheetRow}`;
}

export function instagramCaption(row: CatalogRow): string {
  const description = (row.description || row.youtube_title || row.title || '').trim();
  const tags = (row.hashtags || '').trim();
  const caption = tags && !description.includes(tags) ? `${description}\n\n${tags}` : description;
  return caption.trim().slice(0, 2200);
}

export function youtubeTitle(row: CatalogRow): string {
  return (row.youtube_title || row.title || row.id || 'Untitled').trim().slice(0, 100);
}

export function youtubeDescription(row: CatalogRow): string {
  const base = (row.description || '').trim();
  const handles = (row.collaborators || process.env.YOUTUBE_COLLABORATORS || '')
    .split(',')
    .map((part) => part.trim().replace(/^@/, ''))
    .filter(Boolean)
    .map((handle) => `@${handle}`);
  const credit = handles.join(' ');
  if (!credit || base.includes(credit)) return base.slice(0, 5000);
  return `${base}\n\n${credit}`.trim().slice(0, 5000);
}

export function youtubeTags(hashtags: string): string[] {
  const tags: string[] = [];
  let used = 0;
  for (const raw of hashtags.split(/[\s,]+/)) {
    const tag = raw.replace(/^#/, '').trim();
    if (!tag) continue;
    const next = used + tag.length + (tags.length ? 1 : 0);
    if (next > 480) break;
    tags.push(tag);
    used = next;
  }
  return tags;
}

export function instagramCollaborators(): string[] {
  return (process.env.IG_COLLABORATORS || '')
    .split(',')
    .map((part) => part.trim().replace(/^@/, ''))
    .filter(Boolean);
}

export function shareToFeed(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.IG_SHARE_TO_FEED || 'false').toLowerCase());
}

export function redact(value: string): string {
  return value.replace(/access_token=[^&\s]+/gi, 'access_token=***').slice(0, 500);
}

export function errorDetail(error: unknown): string {
  if (error instanceof Error) return redact(error.message);
  return redact(String(error));
}
