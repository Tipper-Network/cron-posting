import { Injectable, Logger } from '@nestjs/common';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);

  client(): S3Client {
    const region = process.env.AWS_REGION || 'eu-north-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required');
    }
    return new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async ping(): Promise<{ ok: boolean; bucket: string; detail: string }> {
    const bucket = process.env.S3_BUCKET || '';
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
}
