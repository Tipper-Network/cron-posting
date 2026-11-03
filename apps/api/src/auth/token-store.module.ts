import { Module } from '@nestjs/common';
import { S3Module } from '../s3/s3.module';
import { TokenStoreService } from './token-store.service';

@Module({
  imports: [S3Module],
  providers: [TokenStoreService],
  exports: [TokenStoreService],
})
export class TokenStoreModule {}
