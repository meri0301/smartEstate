import { Module } from '@nestjs/common';
import { EmbeddingsRepository } from './embeddings.repository.js';
import { EmbeddingsService } from './embeddings.service.js';

/**
 * Keeping listing text and its vectors in step.
 *
 * A module of its own, rather than part of search or of listings, because both
 * of those need it and neither owns it: listings embed a listing when it is
 * published, search reads the vectors back. Folding it into either would make
 * the two import each other.
 *
 * It depends on nothing but the database and the model client, which is what
 * lets the backfill command boot it without the HTTP layer.
 */
@Module({
  providers: [EmbeddingsService, EmbeddingsRepository],
  exports: [EmbeddingsService, EmbeddingsRepository],
})
export class EmbeddingsModule {}
