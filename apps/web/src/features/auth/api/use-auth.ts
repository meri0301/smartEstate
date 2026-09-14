import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  AuthResponse,
  LoginBody,
  MeResponse,
  RegisterBodyInput,
} from '@smartestate/contracts';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { queryKeys } from '../../../shared/api/query-keys.js';
import { apiRequest } from '../../../shared/api/request.js';
import { sessionStore, useSessionStore } from '../../../shared/api/session-store.js';

export function useRegister(): UseMutationResult<AuthResponse, ApiError, RegisterBodyInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      apiRequest(() => api.POST('/api/auth/register', { body }), { retryOnUnauthorized: false }),
    onSuccess: (response) => {
      sessionStore.setSession(response);
      void queryClient.invalidateQueries({ queryKey: queryKeys.session.me });
    },
  });
}

export function useLogin(): UseMutationResult<AuthResponse, ApiError, LoginBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      apiRequest(() => api.POST('/api/auth/login', { body }), { retryOnUnauthorized: false }),
    onSuccess: (response) => {
      sessionStore.setSession(response);
      void queryClient.invalidateQueries({ queryKey: queryKeys.session.me });
    },
  });
}

/** Ends the current session (this device). Local state is cleared even if the server is unreachable. */
export function useLogout(): UseMutationResult<void, ApiError, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest(() => api.POST('/api/auth/logout'), { retryOnUnauthorized: false }),
    onSettled: () => {
      sessionStore.clearSession();
      queryClient.removeQueries({ queryKey: queryKeys.session.me });
    },
  });
}

/** Ends every session of the user (all devices). */
export function useLogoutAll(): UseMutationResult<void, ApiError, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest(() => api.POST('/api/auth/logout-all')),
    onSettled: () => {
      sessionStore.clearSession();
      queryClient.removeQueries({ queryKey: queryKeys.session.me });
    },
  });
}

/** Current account and buyer profile; only runs once a session exists. */
export function useMe(): UseQueryResult<MeResponse, ApiError> {
  const status = useSessionStore((state) => state.status);
  return useQuery({
    queryKey: queryKeys.session.me,
    queryFn: () => apiRequest(() => api.GET('/api/users/me')),
    enabled: status === 'authenticated',
  });
}
