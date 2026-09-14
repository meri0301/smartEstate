import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { createQueryClient } from '../shared/api/query-client.js';
import { refreshSession } from '../shared/api/session.js';
import { useSessionStore } from '../shared/api/session-store.js';
import { applyTheme, readStoredTheme } from '../shared/ui/theme.js';

interface AppProvidersProps {
  children: ReactNode;
  /** Injected in tests; production creates one client per app instance. */
  queryClient?: QueryClient;
}

/**
 * Composition point for app-wide context: server-state cache, theme and session
 * restoration. Router and i18n providers join here in later phases.
 */
export function AppProviders({ children, queryClient }: AppProvidersProps): JSX.Element {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <ThemeBootstrap />
      <SessionBootstrap />
      {children}
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}

/**
 * Applies the remembered theme to the document root. Omitting `data-theme`
 * entirely is meaningful: it hands the decision to `prefers-color-scheme`,
 * which is what the "system" preference means.
 */
export function ThemeBootstrap(): null {
  useEffect(() => {
    applyTheme(document.documentElement, readStoredTheme(globalThis.localStorage));
  }, []);
  return null;
}

/**
 * On first load the access token lives only in memory, so it is gone after a
 * reload. One refresh call turns the httpOnly cookie back into a session (or
 * settles the status to anonymous) before any protected query runs.
 */
export function SessionBootstrap(): null {
  const status = useSessionStore((state) => state.status);
  useEffect(() => {
    if (status === 'unknown') {
      void refreshSession();
    }
  }, [status]);
  return null;
}
