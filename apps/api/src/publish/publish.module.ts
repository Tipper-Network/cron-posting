import { Module } from '@nestjs/common';
import { S3Module } from '../s3/s3.module';
import { SheetsModule } from '../sheets/sheets.module';
import { InstagramService } from './instagram.service';
import { PublishService } from './publish.service';
import { YoutubeService } from './youtube.service';

@Module({
  imports: [SheetsModule, S3Module],
  providers: [InstagramService, YoutubeService, PublishService],
  exports: [InstagramService, YoutubeService, PublishService],
})
export class PublishModule {}
