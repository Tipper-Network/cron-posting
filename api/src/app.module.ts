import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller';
import { S3Module } from './s3/s3.module';
import { ScheduleBoardController } from './schedule/schedule.controller';
import { ClockService } from './schedule/clock.service';
import { SheetsModule } from './sheets/sheets.module';

@Module({
  imports: [ScheduleModule.forRoot(), SheetsModule, S3Module],
  controllers: [HealthController, ScheduleBoardController],
  providers: [ClockService],
})
export class AppModule {}
