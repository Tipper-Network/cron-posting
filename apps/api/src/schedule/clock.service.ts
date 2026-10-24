import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PublishService } from '../publish/publish.service';
import { errorDetail } from '../publish/text';

@Injectable()
export class ClockService {
  private readonly logger = new Logger(ClockService.name);

  constructor(private readonly publish: PublishService) {}

  /** Every 15 minutes. One due row, Instagram then YouTube. */
  @Cron('0 */15 * * * *')
  async tick() {
    if (process.env.CRON_DISABLED === '1') return;
    try {
      const result = await this.publish.runOnce();
      this.logger.log(
        `tick today=${result.today} due=${result.due} ok=${result.ok} ${result.row || ''} ${result.detail}`,
      );
    } catch (error) {
      this.logger.warn(`tick failed: ${errorDetail(error)}`);
    }
  }
}
