import { Controller, Get } from '@nestjs/common';
import { beirutToday, isDue } from './due';
import { SheetsService } from '../sheets/sheets.service';

@Controller()
export class ScheduleBoardController {
  constructor(private readonly sheets: SheetsService) {}

  @Get('schedule')
  async schedule() {
    const rows = await this.sheets.listRows();
    const today = beirutToday();
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const status = (row.status || 'blank').toLowerCase();
      counts[status] = (counts[status] || 0) + 1;
    }
    return {
      source: 'sheet',
      timezone: 'Asia/Beirut',
      today,
      counts,
      due: rows.filter((row) => isDue(row, today)),
      rows,
    };
  }
}
