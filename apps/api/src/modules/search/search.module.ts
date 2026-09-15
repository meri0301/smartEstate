import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module.js';
import { QueryParserService } from './query-parser.service.js';
import { SearchController } from './search.controller.js';

/**
 * Reading what someone typed. The searching itself stays in the listings module;
 * this one only turns a sentence into the filters that module already accepts.
 */
@Module({
  imports: [GeoModule],
  controllers: [SearchController],
  providers: [QueryParserService],
  exports: [QueryParserService],
})
export class SearchModule {}
