import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { beirutToday, isDue } from './due';
import { SheetsService } from '../sheets/sheets.service';

@Injectable()
export class ClockService {
  private readonly logger = new Logger(ClockService.name);

  constructor(private readonly sheets: SheetsService) {}

  /** Check the Sheet. Posting to Instagram and YouTube is the next step. */
  @Cron('0 */15 * * * *')
  async tick() {
    try {
      const rows = await this.sheets.listRows();
      const today = beirutToday();
      const due = rows.filter((row) => isDue(row, today));
      this.logger.log(`tick today=${today} rows=${rows.length} due=${due.length}`);
      for (const row of due) {
        const title = row.youtube_title || row.title || row.id;
        this.logger.log(
          `due ${row.scheduled_date} ${row.entity} ${row.series} ${row.id} ${title}`,
        );
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`tick failed: ${detail}`);
    }
  }
}
