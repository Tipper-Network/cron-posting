import { Injectable, Logger } from '@nestjs/common';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { google } from 'googleapis';
import { errorDetail } from './text';

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);

  async ping(): Promise<{ ok: boolean; channel: string; id: string; detail: string }> {
    try {
      const youtube = google.youtube({ version: 'v3', auth: this.auth() });
      const listed = await youtube.channels.list({ part: ['snippet'], mine: true });
      const channel = listed.data.items?.[0];
      if (!channel?.id) throw new Error('YouTube token has no channel');
      const expected = process.env.YOUTUBE_CHANNEL_ID;
      if (expected && channel.id !== expected) {
        throw new Error(`token channel ${channel.id} does not match YOUTUBE_CHANNEL_ID`);
      }
      return {
        ok: true,
        channel: channel.snippet?.title || '',
        id: channel.id,
        detail: 'channel ok',
      };
    } catch (error) {
      const detail = errorDetail(error);
      this.logger.warn(detail);
      return { ok: false, channel: '', id: '', detail };
    }
  }

  /** Public resumable upload. Returns the watch URL. Captions are attached when an srt path is passed. */
  async upload(input: {
    filePath: string;
    srtPath?: string;
    title: string;
    description: string;
    tags: string[];
  }): Promise<{ url: string; caption: string }> {
    const youtube = google.youtube({ version: 'v3', auth: this.auth() });
    const inserted = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: input.title,
          description: input.description,
          tags: input.tags,
          categoryId: process.env.YOUTUBE_CATEGORY_ID || '22',
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        },
      },
      media: { body: createReadStream(input.filePath) },
    });
    const videoId = inserted.data.id;
    if (!videoId) throw new Error('YouTube upload returned no video id');
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    if (!input.srtPath) return { url, caption: 'no srt' };
    try {
      await youtube.captions.insert({
        part: ['snippet'],
        sync: true,
        requestBody: {
          snippet: { videoId, language: 'en', name: 'English' },
        },
        media: {
          mimeType: 'application/octet-stream',
          body: createReadStream(input.srtPath),
        },
      });
      return { url, caption: 'attached' };
    } catch (error) {
      const detail = errorDetail(error);
      this.logger.warn(`captions failed for ${videoId}: ${detail}`);
      return { url, caption: detail };
    }
  }

  private auth() {
    const fromFile = tokenFromPath(process.env.YOUTUBE_TOKEN_PATH);
    const clientId = fromFile?.client_id || process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = fromFile?.client_secret || process.env.YOUTUBE_CLIENT_SECRET;
    const refreshToken = fromFile?.refresh_token || process.env.YOUTUBE_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'Set YOUTUBE_TOKEN_PATH or YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET + YOUTUBE_REFRESH_TOKEN',
      );
    }
    const client = new google.auth.OAuth2(clientId, clientSecret);
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }
}

function tokenFromPath(path: string | undefined): {
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
} | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as {
    client_id?: string;
    client_secret?: string;
    refresh_token?: string;
  };
}
