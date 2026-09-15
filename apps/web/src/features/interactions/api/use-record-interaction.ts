import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { InteractionRecorded, RecordInteractionBody } from '@smartestate/contracts';
import { anonymousHeaders } from '../../../shared/api/anonymous-id.js';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { apiRequest } from '../../../shared/api/request.js';

/**
 * Telling the server what the reader did with a listing.
 *
 * Fire-and-forget from the caller's point of view: a click through to a listing
 * must not wait on the outcome being recorded, and a failure to record it must
 * never be shown to the reader — it is the experiment's loss, not theirs. So
 * this is a mutation that callers invoke without awaiting, and it never retries,
 * because a retried outcome is a duplicated outcome.
 *
 * The session id is what turns a click into a verdict on the ranking that
 * showed the listing. Without it the interaction is still recorded, as a fact
 * about the listing, and counts for nothing in any experiment.
 */
export function useRecordInteraction(): UseMutationResult<
  InteractionRecorded,
  ApiError,
  RecordInteractionBody
> {
  return useMutation({
    mutationFn: (body: RecordInteractionBody) =>
      apiRequest(() => api.POST('/api/interactions', { body, headers: anonymousHeaders() })),
    retry: false,
  });
}
