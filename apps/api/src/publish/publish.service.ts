import { Injectable, Logger } from '@nestjs/common';
import { rm } from 'fs/promises';
import { S3Service } from '../s3/s3.service';
import { beirutStamp, beirutToday, isDue, nextDue } from '../schedule/due';
import { SheetsService } from '../sheets/sheets.service';
import { InstagramService } from './instagram.service';
import {
  errorDetail,
  instagramCaption,
  rowLabel,
  youtubeDescription,
  youtubeTags,
  youtubeTitle,
} from './text';
import { YoutubeService } from './youtube.service';

export type TickResult = {
  ok: boolean;
  today: string;
  due: number;
  row?: string;
  detail: string;
  instagram_url?: string;
  youtube_url?: string;
  status?: string;
};

@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);
  private running = false;

  constructor(
    private readonly sheets: SheetsService,
    private readonly s3: S3Service,
    private readonly instagram: InstagramService,
    private readonly youtube: YoutubeService,
  ) {}

  async runOnce(): Promise<TickResult> {
    if (this.running) return { ok: false, today: beirutToday(), due: 0, detail: 'busy' };
    this.running = true;
    try {
      return await this.publishNext();
    } finally {
      this.running = false;
    }
  }

  private async publishNext(): Promise<TickResult> {
    const today = beirutToday();
    const rows = await this.sheets.listRows();
    const due = rows.filter((row) => isDue(row, today)).length;
    const row = nextDue(rows, today);
    if (!row) {
      return { ok: true, today, due, detail: 'nothing scheduled for today' };
    }

    const label = rowLabel(row);
    const sheetRow = Number(row.sheetRow);
    if (row.instagram_url && row.youtube_url) {
      await this.sheets.updateRow(sheetRow, { status: 'posted', posted_at: beirutStamp() });
      return {
        ok: true,
        today,
        due,
        row: label,
        detail: 'marked posted',
        instagram_url: row.instagram_url,
        youtube_url: row.youtube_url,
        status: 'posted',
      };
    }
    this.logger.log(`posting ${label} scheduled ${row.scheduled_date}`);
    const errors: string[] = [];
    let instagramUrl = row.instagram_url || '';
    let youtubeUrl = row.youtube_url || '';
    let key = '';

    try {
      key = await this.s3.resolveKey(row);
      if (!(await this.s3.exists(key))) {
        const detail = `missing s3 object: ${key}`;
        await this.note(sheetRow, detail);
        return { ok: false, today, due, row: label, detail };
      }
    } catch (error) {
      const detail = errorDetail(error);
      await this.note(sheetRow, detail);
      return { ok: false, today, due, row: label, detail };
    }

    const mediaUrl = row.media_url || this.s3.publicUrl(key);
    if (!row.media_url) {
      await this.sheets.updateRow(sheetRow, { media_url: mediaUrl });
    }

    if (!instagramUrl) {
      try {
        if (!(await this.s3.publicReadable(mediaUrl))) {
          throw new Error(`s3 object is not publicly readable: ${mediaUrl}`);
        }
        instagramUrl = await this.instagram.publishReel(mediaUrl, instagramCaption(row));
        await this.sheets.updateRow(sheetRow, { instagram_url: instagramUrl });
      } catch (error) {
        errors.push(`instagram: ${errorDetail(error)}`);
      }
    }

    if (!youtubeUrl) {
      const files: string[] = [];
      try {
        const videoPath = await this.s3.download(key);
        files.push(videoPath);
        const srtKey = key.replace(/\.mp4$/i, '.srt');
        let srtPath: string | undefined;
        if (srtKey !== key && (await this.s3.exists(srtKey))) {
          srtPath = await this.s3.download(srtKey);
          files.push(srtPath);
        }
        const uploaded = await this.youtube.upload({
          filePath: videoPath,
          srtPath,
          title: youtubeTitle(row),
          description: youtubeDescription(row),
          tags: youtubeTags(row.hashtags || ''),
        });
        youtubeUrl = uploaded.url;
        await this.sheets.updateRow(sheetRow, { youtube_url: youtubeUrl });
        if (uploaded.caption !== 'attached' && uploaded.caption !== 'no srt') {
          errors.push(`youtube captions: ${uploaded.caption}`);
        }
      } catch (error) {
        errors.push(`youtube: ${errorDetail(error)}`);
      } finally {
        await Promise.all(files.map((file) => rm(file, { force: true })));
      }
    }

    if (instagramUrl && youtubeUrl && errors.length === 0) {
      await this.sheets.updateRow(sheetRow, {
        status: 'posted',
        posted_at: beirutStamp(),
      });
      return {
        ok: true,
        today,
        due,
        row: label,
        detail: 'posted',
        instagram_url: instagramUrl,
        youtube_url: youtubeUrl,
        status: 'posted',
      };
    }

    if (instagramUrl && youtubeUrl) {
      await this.sheets.updateRow(sheetRow, {
        status: 'posted',
        posted_at: beirutStamp(),
        schedule_note: errors.join(' | ').slice(0, 500),
      });
      return {
        ok: true,
        today,
        due,
        row: label,
        detail: errors.join(' | '),
        instagram_url: instagramUrl,
        youtube_url: youtubeUrl,
        status: 'posted',
      };
    }

    const detail = errors.join(' | ') || 'one platform still empty';
    await this.note(sheetRow, detail);
    return {
      ok: false,
      today,
      due,
      row: label,
      detail,
      instagram_url: instagramUrl,
      youtube_url: youtubeUrl,
      status: 'scheduled',
    };
  }

  private async note(sheetRow: number, detail: string): Promise<void> {
    try {
      await this.sheets.updateRow(sheetRow, { schedule_note: detail.slice(0, 500) });
    } catch (error) {
      this.logger.warn(`could not write schedule_note: ${errorDetail(error)}`);
    }
  }
}
