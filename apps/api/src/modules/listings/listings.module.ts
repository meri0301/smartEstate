import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { BuildingsController } from './buildings.controller.js';
import { BuildingsService } from './buildings.service.js';
import { ListingsController } from './listings.controller.js';
import { ListingsRepository } from './listings.repository.js';
import { ListingsService } from './listings.service.js';

/** Inventory bounded context: buildings and the listings attached to them. */
@Module({
  imports: [AdminModule],
  controllers: [ListingsController, BuildingsController],
  providers: [ListingsRepository, ListingsService, BuildingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
