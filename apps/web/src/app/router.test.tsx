import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createQueryClient } from '../shared/api/query-client.js';
import { useSessionStore } from '../shared/api/session-store.js';
import { LOCALE_STORAGE_KEY } from '../shared/i18n/detect.js';
import { routes } from './router.js';

/**
 * A cache is provided because some routes fetch as soon as they mount; the
 * requests themselves are not stubbed here, since these tests are about routing
 * and the shell, not about data.
 */
function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, view };
}

afterEach(() => {
  window.localStorage.clear();
  useSessionStore.setState({ status: 'unknown', accessToken: null, user: null });
  document.documentElement.removeAttribute('lang');
});

describe('locale routing', () => {
  it('renders the requested language and stamps it on the document', async () => {
    const { router } = renderAt('/ru');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe('/ru');
    expect(document.documentElement.lang).toBe('ru');
    expect(screen.getByText('Стоит ли покупать эту квартиру?')).toBeInTheDocument();
  });

  it('renders Armenian', async () => {
    renderAt('/hy');
    await waitFor(() => {
      expect(screen.getByText('Գնե՞լ այս բնակարանը, թե՞ ոչ')).toBeInTheDocument();
    });
    // Armenian plural selection is asserted in plurals.test.ts and on the search screen.
    expect(screen.getAllByRole('link', { name: 'Սկսել' })).toHaveLength(2);
  });

  it('redirects a path with no locale to one that has it', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'ru');
    const { router } = renderAt('/');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/ru');
    });
  });

  it('replaces an unsupported locale rather than rendering a half-translated page', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'hy');
    const { router } = renderAt('/de/listings');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/hy/listings');
    });
  });

  it('prefers the signed-in account’s language over the remembered one', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'ru');
    useSessionStore.setState({
      status: 'authenticated',
      accessToken: 't',
      user: {
        id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f',
        email: 'a@b.co',
        role: 'USER',
        locale: 'en',
        displayName: 'Ani',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    });
    const { router } = renderAt('/');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/en');
    });
  });

  it('shows a translated not-found page for an unknown path inside a locale', async () => {
    renderAt('/en/nowhere');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument();
    });
  });
});

describe('language switcher', () => {
  it('offers every language as a link to the same page', async () => {
    renderAt('/en');
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Language' })).toBeInTheDocument();
    });
    const links = screen.getAllByRole('link').filter((link) => link.hasAttribute('hreflang'));
    expect(links.map((link) => link.getAttribute('hreflang'))).toEqual(['hy', 'ru', 'en']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/hy', '/ru', '/en']);
  });

  it('marks the active language and switches on click', async () => {
    const { router } = renderAt('/en');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Current language: English' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('link', { name: 'Switch to Հայերեն' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/hy');
    });
    expect(document.documentElement.lang).toBe('hy');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('hy');
  });

  it('keeps the rest of the path when switching', async () => {
    const { router } = renderAt('/en/nowhere');
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Language' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('link', { name: 'Switch to Русский' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/ru/nowhere');
    });
  });
});

describe('theme toggle', () => {
  it('is a radio group whose choice reaches the document and storage', async () => {
    renderAt('/en');
    await waitFor(() => {
      expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await userEvent.click(screen.getByRole('radio', { name: 'Match system' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
