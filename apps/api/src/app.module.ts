import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller';
import { PublishModule } from './publish/publish.module';
import { S3Module } from './s3/s3.module';
import { ClockService } from './schedule/clock.service';
import { ScheduleBoardController } from './schedule/schedule.controller';
import { SheetsModule } from './sheets/sheets.module';

@Module({
  imports: [ScheduleModule.forRoot(), SheetsModule, S3Module, PublishModule],
  controllers: [HealthController, ScheduleBoardController],
  providers: [ClockService],
})
export class AppModule {}
