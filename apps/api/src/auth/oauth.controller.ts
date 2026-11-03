import {
  Controller,
  Get,
  Logger,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import type { Response } from 'express';
import { google } from 'googleapis';
import { InstagramService } from '../publish/instagram.service';
import { YoutubeService } from '../publish/youtube.service';
import { errorDetail, redact } from '../publish/text';
import { TokenStoreService } from './token-store.service';

const YT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

const IG_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
].join(',');

@Controller('oauth')
export class OauthController {
  private readonly logger = new Logger(OauthController.name);

  constructor(
    private readonly tokens: TokenStoreService,
    private readonly youtube: YoutubeService,
    private readonly instagram: InstagramService,
  ) {}

  @Get('status')
  async status() {
    const tokens = await this.tokens.status();
    const [youtubePing, instagramPing] = await Promise.all([
      this.youtube.ping(),
      this.instagram.ping(),
    ]);
    return {
      public_api_url: publicApiUrl(),
      gate_required: Boolean(process.env.OAUTH_GATE),
      tokens,
      youtube_ping: { ok: youtubePing.ok, channel: youtubePing.channel, detail: youtubePing.detail },
      instagram_ping: {
        ok: instagramPing.ok,
        username: instagramPing.username,
        detail: instagramPing.detail,
      },
      sheets_hint: 'Prefer GOOGLE_SERVICE_ACCOUNT_JSON shared on the Sheet. Do not use user OAuth for Sheets.',
    };
  }

  @Get('youtube')
  youtubeStart(@Query('gate') gate: string | undefined, @Res() res: Response): void {
    assertGate(gate);
    const { clientId, clientSecret } = youtubeClient();
    const redirectUri = `${publicApiUrl()}/oauth/youtube/callback`;
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: YT_SCOPES,
      state: signState('youtube'),
      include_granted_scopes: true,
    });
    res.redirect(url);
  }

  @Get('youtube/callback')
  async youtubeCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (error) throw new Error(`Google denied: ${error}`);
      if (!code) throw new Error('missing code');
      verifyState(state, 'youtube');
      const { clientId, clientSecret } = youtubeClient();
      const redirectUri = `${publicApiUrl()}/oauth/youtube/callback`;
      const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      const { tokens } = await client.getToken(code);
      if (!tokens.refresh_token) {
        throw new Error(
          'Google returned no refresh_token. Revoke access for this app at myaccount.google.com/permissions and Connect again with prompt=consent.',
        );
      }
      await this.tokens.patch({
        youtube: {
          refresh_token: tokens.refresh_token,
          updated_at: new Date().toISOString(),
        },
      });
      const ping = await this.youtube.ping();
      if (!ping.ok) throw new Error(`token saved but channel ping failed: ${ping.detail}`);
      this.logger.log(`youtube connected as ${ping.channel || ping.id}`);
      res.redirect(webReturn('youtube', 'ok', ping.channel || ping.id));
    } catch (err) {
      const detail = errorDetail(err);
      this.logger.warn(`youtube oauth failed: ${detail}`);
      res.redirect(webReturn('youtube', 'error', detail));
    }
  }

  @Get('instagram')
  instagramStart(@Query('gate') gate: string | undefined, @Res() res: Response): void {
    assertGate(gate);
    const { appId } = metaApp();
    const redirectUri = `${publicApiUrl()}/oauth/instagram/callback`;
    const url = new URL('https://www.facebook.com/v20.0/dialog/oauth');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', signState('instagram'));
    url.searchParams.set('scope', IG_SCOPES);
    url.searchParams.set('response_type', 'code');
    res.redirect(url.toString());
  }

  @Get('instagram/callback')
  async instagramCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_message') errorMessage: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (error) throw new Error(errorMessage || error);
      if (!code) throw new Error('missing code');
      verifyState(state, 'instagram');
      const { appId, appSecret } = metaApp();
      const redirectUri = `${publicApiUrl()}/oauth/instagram/callback`;

      const short = await metaForm<{ access_token?: string }>(
        'https://graph.facebook.com/v20.0/oauth/access_token',
        {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        },
      );
      if (!short.access_token) throw new Error('Meta returned no short-lived token');

      const longLived = await metaForm<{
        access_token?: string;
        expires_in?: number;
      }>('https://graph.facebook.com/v20.0/oauth/access_token', {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: short.access_token,
      });
      if (!longLived.access_token) throw new Error('Meta long-lived exchange failed');

      const expiresIn = Number(longLived.expires_in || 60 * 24 * 60 * 60);
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      await this.tokens.patch({
        instagram: {
          access_token: longLived.access_token,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
      });
      const ping = await this.instagram.ping();
      if (!ping.ok) throw new Error(`token saved but Graph ping failed: ${ping.detail}`);
      this.logger.log(`instagram connected as @${ping.username}`);
      res.redirect(webReturn('instagram', 'ok', ping.username || 'connected'));
    } catch (err) {
      const detail = errorDetail(err);
      this.logger.warn(`instagram oauth failed: ${detail}`);
      res.redirect(webReturn('instagram', 'error', detail));
    }
  }
}

function publicApiUrl(): string {
  const raw =
    process.env.PUBLIC_API_URL ||
    process.env.API_PUBLIC_URL ||
    'https://api.cron-posting.psyferblock.io';
  return raw.replace(/\/+$/, '');
}

function publicWebUrl(): string {
  const raw =
    process.env.PUBLIC_WEB_URL ||
    process.env.WEB_PUBLIC_URL ||
    'https://cron-posting.psyferblock.io';
  return raw.replace(/\/+$/, '');
}

function webReturn(platform: string, result: 'ok' | 'error', detail: string): string {
  const url = new URL(publicWebUrl());
  url.searchParams.set('oauth', platform);
  url.searchParams.set('result', result);
  url.searchParams.set('detail', redact(detail).slice(0, 180));
  return url.toString();
}

function assertGate(gate: string | undefined): void {
  const expected = process.env.OAUTH_GATE || '';
  if (!expected) {
    throw new UnauthorizedException('Set OAUTH_GATE on the API, then open /oauth/…?gate=…');
  }
  if (!gate || gate !== expected) {
    throw new UnauthorizedException('bad gate');
  }
}

function signState(platform: string): string {
  const gate = process.env.OAUTH_GATE || '';
  const nonce = randomBytes(16).toString('hex');
  const payload = `${platform}.${nonce}`;
  const sig = createHmac('sha256', gate).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyState(state: string | undefined, platform: string): void {
  if (!state) throw new UnauthorizedException('missing state');
  const parts = state.split('.');
  if (parts.length !== 3) throw new UnauthorizedException('bad state');
  const [gotPlatform, nonce, sig] = parts;
  if (gotPlatform !== platform) throw new UnauthorizedException('state platform mismatch');
  const gate = process.env.OAUTH_GATE || '';
  const expect = createHmac('sha256', gate).update(`${gotPlatform}.${nonce}`).digest('hex');
  if (sig !== expect) throw new UnauthorizedException('bad state signature');
}

function youtubeClient(): { clientId: string; clientSecret: string } {
  const clientId = process.env.YOUTUBE_CLIENT_ID || '';
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) {
    throw new Error('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET');
  }
  return { clientId, clientSecret };
}

function metaApp(): { appId: string; appSecret: string } {
  const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || '';
  const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '';
  if (!appId || !appSecret) {
    throw new Error('Set META_APP_ID and META_APP_SECRET');
  }
  return { appId, appSecret };
}

async function metaForm<T>(url: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(params);
  const response = await fetch(`${url}?${body.toString()}`, {
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok || data.error) {
    throw new Error(redact(data.error?.message || `Meta HTTP ${response.status}`));
  }
  return data;
}
