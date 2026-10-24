import { Injectable, Logger } from '@nestjs/common';
import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { CatalogRow } from '../schedule/due';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);

  client(): S3Client {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required');
    }
    return new S3Client({
      region: this.region(),
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async ping(): Promise<{ ok: boolean; bucket: string; detail: string }> {
    const bucket = this.bucket();
    if (!bucket) return { ok: false, bucket, detail: 'S3_BUCKET is not set' };
    try {
      await this.client().send(new HeadBucketCommand({ Bucket: bucket }));
      return { ok: true, bucket, detail: 'bucket reachable' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(detail);
      return { ok: false, bucket, detail };
    }
  }

  /** Key the local pipeline uploaded: socials/{path under step-4}. */
  keyForPath(videoPath: string): string {
    let relative = videoPath.replace(/^\/+/, '');
    const marker = 'step-4-ready-to-post/';
    if (relative.startsWith(marker)) relative = relative.slice(marker.length);
    const prefix = this.prefix();
    return prefix ? `${prefix}/${relative}` : relative;
  }

  keyFromUrl(url: string): string {
    const path = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));
    const bucket = this.bucket();
    if (bucket && path.startsWith(`${bucket}/`)) return path.slice(bucket.length + 1);
    return path;
  }

  async resolveKey(row: CatalogRow): Promise<string> {
    if (row.video_path) {
      const fromPath = this.keyForPath(row.video_path);
      if (await this.exists(fromPath)) return fromPath;
    }
    if (row.media_url) {
      const fromUrl = this.keyFromUrl(row.media_url);
      if (await this.exists(fromUrl)) return fromUrl;
    }
    if (row.video_path) return this.keyForPath(row.video_path);
    if (row.media_url) return this.keyFromUrl(row.media_url);
    throw new Error('row has no video_path or media_url');
  }

  publicUrl(key: string): string {
    const encoded = key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    return `https://s3.${this.region()}.amazonaws.com/${this.bucket()}/${encoded}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client().send(new HeadObjectCommand({ Bucket: this.bucket(), Key: key }));
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number }; name?: string })
        .$metadata?.httpStatusCode;
      const name = (error as { name?: string }).name;
      if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') return false;
      throw error;
    }
  }

  async download(key: string): Promise<string> {
    const result = await this.client().send(
      new GetObjectCommand({ Bucket: this.bucket(), Key: key }),
    );
    if (!result.Body) throw new Error(`empty s3 object: ${key}`);
    const dest = join(tmpdir(), `cron-posting-${Date.now()}-${key.split('/').pop()}`);
    await pipeline(asReadable(result.Body), createWriteStream(dest));
    return dest;
  }

  async publicReadable(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        headers: { Range: 'bytes=0-15' },
        signal: AbortSignal.timeout(20000),
      });
      return response.ok || response.status === 206;
    } catch {
      return false;
    }
  }

  bucket(): string {
    return process.env.S3_BUCKET || process.env.S3_BUCKET_NAME || '';
  }

  private prefix(): string {
    return (process.env.S3_PREFIX || 'socials').replace(/^\/+|\/+$/g, '');
  }

  private region(): string {
    return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-north-1';
  }
}

function asReadable(body: unknown): Readable {
  if (body instanceof Readable) return body;
  throw new Error('S3 object body is not a stream');
}
