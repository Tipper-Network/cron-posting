import { Module } from '@nestjs/common';
import { PublishModule } from '../publish/publish.module';
import { InstagramRefreshService } from './instagram-refresh.service';
import { OauthController } from './oauth.controller';
import { TokenStoreModule } from './token-store.module';

@Module({
  imports: [TokenStoreModule, PublishModule],
  controllers: [OauthController],
  providers: [InstagramRefreshService],
})
export class AuthModule {}
