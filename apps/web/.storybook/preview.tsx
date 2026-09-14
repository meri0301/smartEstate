import type { Decorator, Preview } from '@storybook/react-vite';
import { useEffect, type JSX, type ReactNode } from 'react';
import { I18nProvider } from '../src/shared/i18n/I18nProvider.js';
import { isLocale } from '../src/shared/i18n/locales.js';
import { applyTheme, isThemePreference } from '../src/shared/ui/theme.js';
import '../src/styles/index.css';

/**
 * Theme and locale are Storybook globals rather than story arguments, so every
 * primitive can be inspected in light and dark, and in each of the three
 * languages, without the stories having to model it themselves.
 *
 * The locale is applied as a `lang` attribute because that is what drives the
 * font selection in production: `styles/fonts.css` keys off `:lang()`, so a
 * story shown in Armenian uses the real Armenian face rather than a fallback.
 */
function ThemeFrame({ theme, children }: { theme: string; children: ReactNode }): JSX.Element {
  useEffect(() => {
    applyTheme(document.documentElement, isThemePreference(theme) ? theme : 'light');
  }, [theme]);
  return <>{children}</>;
}

const withTheme: Decorator = (Story, context) => (
  <ThemeFrame theme={String(context.globals.theme ?? 'light')}>
    <Story />
  </ThemeFrame>
);

const withLocale: Decorator = (Story, context) => {
  const raw = String(context.globals.locale ?? 'en');
  const locale = isLocale(raw) ? raw : 'en';
  return (
    <I18nProvider locale={locale}>
      <div lang={locale} className="bg-bg p-6 text-text-secondary">
        <Story />
      </div>
    </I18nProvider>
  );
};

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'error' },
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: {
        title: 'Theme',
        icon: 'contrast',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
          { value: 'system', title: 'System' },
        ],
        dynamicTitle: true,
      },
    },
    locale: {
      description: 'Content language',
      toolbar: {
        title: 'Locale',
        icon: 'globe',
        items: [
          { value: 'hy', title: 'Հայերեն (hy)' },
          { value: 'ru', title: 'Русский (ru)' },
          { value: 'en', title: 'English (en)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light', locale: 'hy' },
  decorators: [withLocale, withTheme],
};

export default preview;
