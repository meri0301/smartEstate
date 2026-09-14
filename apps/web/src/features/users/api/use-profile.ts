import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { MeResponse, PreferencesBody, UpdateMeBody } from '@smartestate/contracts';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { queryKeys } from '../../../shared/api/query-keys.js';
import { apiRequest } from '../../../shared/api/request.js';

export function useUpdateMe(): UseMutationResult<MeResponse, ApiError, UpdateMeBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => apiRequest(() => api.PATCH('/api/users/me', { body })),
    onSuccess: (me) => {
      queryClient.setQueryData(queryKeys.session.me, me);
    },
  });
}

/** Saves the onboarding quiz answers (budget, rooms, priorities, commute anchor). */
export function useUpdatePreferences(): UseMutationResult<MeResponse, ApiError, PreferencesBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => apiRequest(() => api.PUT('/api/users/me/preferences', { body })),
    onSuccess: (me) => {
      queryClient.setQueryData(queryKeys.session.me, me);
    },
  });
}
