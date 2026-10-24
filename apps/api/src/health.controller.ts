import { Controller, Get } from '@nestjs/common';
import { InstagramService } from './publish/instagram.service';
import { YoutubeService } from './publish/youtube.service';
import { S3Service } from './s3/s3.service';
import { SheetsService } from './sheets/sheets.service';

@Controller()
export class HealthController {
  constructor(
    private readonly sheets: SheetsService,
    private readonly s3: S3Service,
    private readonly instagram: InstagramService,
    private readonly youtube: YoutubeService,
  ) {}

  @Get('live')
  live() {
    return { ok: true };
  }

  @Get('health')
  async health() {
    const [sheets, s3, instagram, youtube] = await Promise.all([
      this.sheets.ping(),
      this.s3.ping(),
      this.instagram.ping(),
      this.youtube.ping(),
    ]);
    return {
      ok: sheets.ok && s3.ok && instagram.ok && youtube.ok,
      sheets,
      s3,
      instagram,
      youtube,
    };
  }
}
