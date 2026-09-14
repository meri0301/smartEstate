import { describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  isThemePreference,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  THEME_STORAGE_KEY,
} from './theme.js';

describe('isThemePreference', () => {
  it('accepts the three supported values and nothing else', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});

describe('readStoredTheme', () => {
  it('returns the stored value when it is valid', () => {
    expect(readStoredTheme({ getItem: () => 'dark' })).toBe('dark');
  });

  it('falls back to system for missing, corrupted or unavailable storage', () => {
    expect(readStoredTheme({ getItem: () => null })).toBe('system');
    expect(readStoredTheme({ getItem: () => 'neon' })).toBe('system');
    expect(readStoredTheme(undefined)).toBe('system');
    expect(
      readStoredTheme({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe('system');
  });
});

describe('storeTheme', () => {
  it('writes under the documented key', () => {
    const setItem = vi.fn();
    storeTheme({ setItem }, 'dark');
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'dark');
  });

  it('swallows storage failures rather than breaking the page', () => {
    expect(() => {
      storeTheme(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        'light',
      );
    }).not.toThrow();
  });
});

describe('applyTheme', () => {
  it('stamps an explicit choice and removes the attribute for system', () => {
    const root = document.createElement('html');
    applyTheme(root, 'dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    applyTheme(root, 'light');
    expect(root.getAttribute('data-theme')).toBe('light');
    applyTheme(root, 'system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('honours an explicit choice regardless of the operating system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the operating system when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
