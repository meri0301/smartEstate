import type { JSX } from 'react';
import { createBrowserRouter, Navigate, useLocation, type RouteObject } from 'react-router';
import { useSessionStore } from '../shared/api/session-store.js';
import { detectLocale, withLocalePath } from '../shared/i18n/detect.js';
import { AlternativesPage } from './routes/AlternativesPage.js';
import { HomePage } from './routes/HomePage.js';
import { ListingDetailPage } from './routes/ListingDetailPage.js';
import { MortgagePage } from './routes/MortgagePage.js';
import { LocaleLayout } from './routes/LocaleLayout.js';
import { NotFoundPage } from './routes/NotFoundPage.js';
import { SearchPage } from './routes/SearchPage.js';

/**
 * Sends a path with no locale segment to the same path with one.
 *
 * Every URL in the application carries its language, so a link can be shared,
 * bookmarked and indexed in the language it was written in. That makes the
 * locale-less form a redirect rather than a page.
 */
export function LocaleRedirect(): JSX.Element {
  const { pathname, search } = useLocation();
  const profileLocale = useSessionStore((state) => state.user?.locale);
  const detected = detectLocale({
    pathname,
    profileLocale,
    storage: globalThis.localStorage,
    acceptLanguages: globalThis.navigator.languages,
  });
  return <Navigate to={{ pathname: withLocalePath(pathname, detected.locale), search }} replace />;
}

export const routes: RouteObject[] = [
  { path: '/', element: <LocaleRedirect /> },
  {
    path: '/:locale',
    element: <LocaleLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'listings', element: <SearchPage /> },
      { path: 'listings/:idOrPublicId', element: <ListingDetailPage /> },
      { path: 'listings/:idOrPublicId/alternatives', element: <AlternativesPage /> },
      { path: 'mortgage', element: <MortgagePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '*', element: <LocaleRedirect /> },
];

export function createAppRouter(): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(routes);
}
