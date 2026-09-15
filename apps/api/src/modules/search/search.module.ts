import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { GeoModule } from '../geo/geo.module.js';
import { ListingsModule } from '../listings/listings.module.js';
import { HybridSearchRepository } from './hybrid.repository.js';
import { HybridSearchService } from './hybrid-search.service.js';
import { QueryParserService } from './query-parser.service.js';
import { SearchController } from './search.controller.js';

/**
 * Reading what someone typed, and answering it.
 *
 * Parsing turns a sentence into filters; hybrid search applies them and ranks
 * what passes. Listings are imported for the row and translation reads that turn
 * ranked ids back into something a client can render — the ranking itself is
 * this module's own SQL, because it is a different question from "give me a page
 * of the catalogue" and answering it through a paginated search would mean
 * fighting the cursor.
 */
@Module({
  imports: [GeoModule, ListingsModule, EmbeddingsModule],
  controllers: [SearchController],
  providers: [QueryParserService, HybridSearchService, HybridSearchRepository],
  exports: [QueryParserService],
})
export class SearchModule {}
