/**
 * Theme selection.
 *
 * Three states, matching the tokens stylesheet: an explicit `light` or `dark`
 * stamps `data-theme` on the root element, and `system` removes the attribute
 * so the `prefers-color-scheme` media query decides. The choice is remembered
 * per browser; it is a per-device preference, not account data.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'se-theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Reads the stored preference, tolerating unavailable or corrupted storage. */
export function readStoredTheme(storage: Pick<Storage, 'getItem'> | undefined): ThemePreference {
  try {
    const raw = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function storeTheme(
  storage: Pick<Storage, 'setItem'> | undefined,
  preference: ThemePreference,
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // A private window or blocked storage must not break theming.
  }
}

/** Applies the preference to the document root. */
export function applyTheme(root: HTMLElement, preference: ThemePreference): void {
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
}

/** The theme that will actually be painted, resolving `system` against the OS. */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
  if (preference !== 'system') {
    return preference;
  }
  return prefersDark ? 'dark' : 'light';
}
