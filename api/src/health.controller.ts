import { Controller, Get } from '@nestjs/common';
import { S3Service } from './s3/s3.service';
import { SheetsService } from './sheets/sheets.service';

@Controller()
export class HealthController {
  constructor(
    private readonly sheets: SheetsService,
    private readonly s3: S3Service,
  ) {}

  @Get('live')
  live() {
    return { ok: true };
  }

  @Get('health')
  async health() {
    const [sheets, s3] = await Promise.all([this.sheets.ping(), this.s3.ping()]);
    return { ok: sheets.ok && s3.ok, sheets, s3 };
  }
}
