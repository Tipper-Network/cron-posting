import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadDotEnv } from './env';
import { PublishService } from './publish/publish.service';
import { S3Service } from './s3/s3.service';
import { SheetsService } from './sheets/sheets.service';

const KNOWN_KEY = 'socials/gaf/ig-test/01-attract/01_sh01_ig-pipeline-test.mp4';

async function main() {
  process.env.CRON_DISABLED = '1';
  loadDotEnv();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const sheets = app.get(SheetsService);
    const s3 = app.get(S3Service);
    const publish = app.get(PublishService);
    const rows = await sheets.listRows();
    const probe = rows.find((row) => row.series === 'ig-test' && row.id === 'sh01');
    let write = 'no ig-test row';
    if (probe) {
      await sheets.updateRow(Number(probe.sheetRow), {
        schedule_note: probe.schedule_note || '',
      });
      write = `rewrote schedule_note on row ${probe.sheetRow}`;
    }
    const exists = await s3.exists(KNOWN_KEY);
    const publicUrl = s3.publicUrl(KNOWN_KEY);
    const readable = exists ? await s3.publicReadable(publicUrl) : false;
    const tick = await publish.runOnce();
    console.log(
      JSON.stringify(
        {
          rows: rows.length,
          sheetWrite: write,
          s3Key: KNOWN_KEY,
          s3Exists: exists,
          s3Public: readable,
          tick,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
