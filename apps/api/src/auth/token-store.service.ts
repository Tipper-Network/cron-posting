import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from '../s3/s3.service';

export type YoutubeStored = {
  refresh_token: string;
  updated_at: string;
};

export type InstagramStored = {
  access_token: string;
  expires_at: string;
  updated_at: string;
};

export type StoredTokens = {
  youtube?: YoutubeStored;
  instagram?: InstagramStored;
};

@Injectable()
export class TokenStoreService {
  private readonly logger = new Logger(TokenStoreService.name);
  private cache: StoredTokens | null = null;

  constructor(private readonly s3: S3Service) {}

  secretsKey(): string {
    const custom = process.env.OAUTH_TOKEN_S3_KEY?.replace(/^\/+/, '');
    if (custom) return custom;
    const prefix = this.s3.prefix();
    return prefix ? `${prefix}/secrets/oauth-tokens.json` : 'secrets/oauth-tokens.json';
  }

  async read(): Promise<StoredTokens> {
    if (this.cache) return this.cache;
    const raw = await this.s3.getText(this.secretsKey());
    if (!raw) {
      this.cache = {};
      return this.cache;
    }
    try {
      this.cache = JSON.parse(raw) as StoredTokens;
    } catch {
      this.logger.warn('oauth token object is not valid JSON; starting empty');
      this.cache = {};
    }
    return this.cache;
  }

  async patch(next: Partial<StoredTokens>): Promise<StoredTokens> {
    const current = await this.read();
    const merged: StoredTokens = {
      ...current,
      ...next,
      youtube: next.youtube ?? current.youtube,
      instagram: next.instagram ?? current.instagram,
    };
    await this.s3.putText(this.secretsKey(), `${JSON.stringify(merged, null, 2)}\n`);
    this.cache = merged;
    this.logger.log(`wrote oauth tokens to s3://${this.s3.bucket()}/${this.secretsKey()}`);
    return merged;
  }

  invalidate(): void {
    this.cache = null;
  }

  async youtubeRefreshToken(): Promise<string | null> {
    const stored = (await this.read()).youtube?.refresh_token?.trim();
    if (stored) return stored;
    return process.env.YOUTUBE_REFRESH_TOKEN?.trim() || null;
  }

  async instagramAccessToken(): Promise<string | null> {
    const stored = (await this.read()).instagram?.access_token?.trim();
    if (stored) return stored;
    return (
      process.env.META_ACCESS_TOKEN?.trim() ||
      process.env.IG_ACCESS_TOKEN?.trim() ||
      null
    );
  }

  async status(): Promise<{
    youtube: { connected: boolean; source: string; updated_at?: string };
    instagram: {
      connected: boolean;
      source: string;
      updated_at?: string;
      expires_at?: string;
      days_left?: number;
    };
    secrets_key: string;
  }> {
    const stored = await this.read();
    const ytStored = Boolean(stored.youtube?.refresh_token);
    const ytEnv = Boolean(process.env.YOUTUBE_REFRESH_TOKEN?.trim());
    const igStored = Boolean(stored.instagram?.access_token);
    const igEnv = Boolean(
      process.env.META_ACCESS_TOKEN?.trim() || process.env.IG_ACCESS_TOKEN?.trim(),
    );
    const expiresAt = stored.instagram?.expires_at;
    let daysLeft: number | undefined;
    if (expiresAt) {
      daysLeft = Math.floor((Date.parse(expiresAt) - Date.now()) / 86_400_000);
    }
    return {
      youtube: {
        connected: ytStored || ytEnv,
        source: ytStored ? 's3' : ytEnv ? 'env' : 'none',
        updated_at: stored.youtube?.updated_at,
      },
      instagram: {
        connected: igStored || igEnv,
        source: igStored ? 's3' : igEnv ? 'env' : 'none',
        updated_at: stored.instagram?.updated_at,
        expires_at: expiresAt,
        days_left: daysLeft,
      },
      secrets_key: this.secretsKey(),
    };
  }
}
