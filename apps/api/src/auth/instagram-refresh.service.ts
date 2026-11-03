import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { errorDetail, redact } from '../publish/text';
import { TokenStoreService } from './token-store.service';

/** Extend the long-lived Instagram token before the ~60 day cliff. */
@Injectable()
export class InstagramRefreshService {
  private readonly logger = new Logger(InstagramRefreshService.name);

  constructor(private readonly tokens: TokenStoreService) {}

  /** Daily 03:10 Asia/Beirut wall is fine; server TZ may differ — once a day is enough. */
  @Cron('10 3 * * *')
  async daily(): Promise<void> {
    if (process.env.CRON_DISABLED === '1') return;
    try {
      const result = await this.refreshIfNeeded(14);
      this.logger.log(`instagram refresh: ${result}`);
    } catch (error) {
      this.logger.warn(`instagram refresh failed: ${errorDetail(error)}`);
    }
  }

  async refreshIfNeeded(withinDays = 14): Promise<string> {
    const stored = await this.tokens.read();
    const current = stored.instagram;
    if (!current?.access_token) return 'no s3 instagram token';

    if (current.expires_at) {
      const daysLeft = Math.floor((Date.parse(current.expires_at) - Date.now()) / 86_400_000);
      if (daysLeft > withinDays) return `ok, ${daysLeft} days left`;
    }

    const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || '';
    const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '';
    if (!appId || !appSecret) return 'META_APP_ID / META_APP_SECRET missing';

    const url = new URL('https://graph.facebook.com/v20.0/oauth/access_token');
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('fb_exchange_token', current.access_token);

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) });
    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!response.ok || data.error || !data.access_token) {
      throw new Error(redact(data.error?.message || `Meta HTTP ${response.status}`));
    }

    const expiresIn = Number(data.expires_in || 60 * 24 * 60 * 60);
    await this.tokens.patch({
      instagram: {
        access_token: data.access_token,
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    return `extended ${Math.floor(expiresIn / 86_400)} days`;
  }
}
