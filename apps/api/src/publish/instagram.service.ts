import { Injectable, Logger } from '@nestjs/common';
import {
  errorDetail,
  instagramCollaborators,
  redact,
  shareToFeed,
} from './text';

const GRAPH = 'https://graph.facebook.com/v20.0';

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  async ping(): Promise<{ ok: boolean; username: string; detail: string }> {
    try {
      const { igId, token } = this.config();
      const data = await graphGet<{ id?: string; username?: string }>(
        `/${igId}?fields=id,username&access_token=${encodeURIComponent(token)}`,
      );
      if (!data.id) throw new Error('Instagram id missing');
      return { ok: true, username: data.username || '', detail: 'graph ok' };
    } catch (error) {
      const detail = errorDetail(error);
      this.logger.warn(detail);
      return { ok: false, username: '', detail };
    }
  }

  /** Create Reel container, wait until FINISHED, publish. Returns the public permalink. */
  async publishReel(videoUrl: string, caption: string): Promise<string> {
    const { igId, token } = this.config();
    const payload = new URLSearchParams({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: shareToFeed() ? 'true' : 'false',
      access_token: token,
    });
    const collaborators = instagramCollaborators();
    if (collaborators.length > 0) payload.set('collaborators', JSON.stringify(collaborators));

    const created = await graphPost<{ id?: string }>(`/${igId}/media`, payload);
    if (!created.id) throw new Error('Instagram create container returned no id');
    await this.waitUntilFinished(created.id, token);
    const published = await graphPost<{ id?: string }>(
      `/${igId}/media_publish`,
      new URLSearchParams({ creation_id: created.id, access_token: token }),
    );
    if (!published.id) throw new Error('Instagram publish returned no id');
    return this.permalink(published.id, token);
  }

  private async waitUntilFinished(creationId: string, token: string): Promise<void> {
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      const data = await graphGet<{ status_code?: string }>(
        `/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
      );
      if (data.status_code === 'FINISHED') return;
      if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
        throw new Error(`Instagram container ${creationId} ${data.status_code}`);
      }
      await sleep(10_000);
    }
    throw new Error(`Instagram container ${creationId} not FINISHED within 10 minutes`);
  }

  private async permalink(mediaId: string, token: string): Promise<string> {
    try {
      const data = await graphGet<{ permalink?: string }>(
        `/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`,
      );
      if (data.permalink) return data.permalink;
    } catch (error) {
      this.logger.warn(`permalink lookup failed: ${errorDetail(error)}`);
    }
    return `graph:${mediaId}`;
  }

  private config(): { igId: string; token: string } {
    const igId = process.env.IG_BUSINESS_ID || '';
    const token = process.env.META_ACCESS_TOKEN || process.env.IG_ACCESS_TOKEN || '';
    if (!igId || !token) throw new Error('Set IG_BUSINESS_ID and META_ACCESS_TOKEN');
    return { igId, token };
  }
}

async function graphGet<T>(pathAndQuery: string): Promise<T> {
  const response = await fetch(`${GRAPH}${pathAndQuery}`, { signal: AbortSignal.timeout(60_000) });
  return readGraph<T>(response);
}

async function graphPost<T>(path: string, body: URLSearchParams): Promise<T> {
  const response = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(120_000),
  });
  return readGraph<T>(response);
}

async function readGraph<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok || data.error) {
    throw new Error(redact(data.error?.message || `Instagram HTTP ${response.status}`));
  }
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
