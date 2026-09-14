import type { JSX, ReactNode } from 'react';

export const SAMPLE_LOCALES = ['hy', 'ru', 'en'] as const;
export type SampleLocale = (typeof SAMPLE_LOCALES)[number];

export interface SampleCopy {
  language: string;
  save: string;
  cancel: string;
  /** Deliberately long, to expose wrapping and truncation problems. */
  longAction: string;
  districtLabel: string;
  districtHint: string;
  districtError: string;
  placeholder: string;
  notesLabel: string;
  heading: string;
  paragraph: string;
  verdict: string;
  overview: string;
  details: string;
  history: string;
  tooltip: string;
  savedTitle: string;
  savedBody: string;
  errorTitle: string;
  close: string;
  confirmTitle: string;
  confirmBody: string;
}

/**
 * Realistic copy for every primitive, in the three shipped languages.
 *
 * Armenian and Russian run noticeably longer than English — `longAction` is
 * 40% wider in Armenian — which is the point: a control that only ever sees
 * English text hides its layout bugs until translation.
 */
export const SAMPLE: Record<SampleLocale, SampleCopy> = {
  hy: {
    language: 'Հայերեն',
    save: 'Պահպանել',
    cancel: 'Չեղարկել',
    longAction: 'Ստանալ գնահատման եզրակացությունը',
    districtLabel: 'Վարչական շրջան',
    districtHint: 'Ընտրեք Երևանի 12 շրջաններից մեկը',
    districtError: 'Խնդրում ենք ընտրել շրջան',
    placeholder: 'Ընտրեք շրջանը',
    notesLabel: 'Լրացուցիչ նշումներ',
    heading: 'Ինչու՞ SmartEstate',
    paragraph:
      'Կառուցված է իրական ժամանակի շուկայական տվյալների և մեքենայական ուսուցման վրա՝ վստահ որոշումներ կայացնելու համար։',
    verdict: 'Գինը ցածր է շուկայականից',
    overview: 'Ակնարկ',
    details: 'Մանրամասներ',
    history: 'Գների պատմություն',
    tooltip: 'Հաշվարկված է մեկ քառակուսի մետրի միջին գնով',
    savedTitle: 'Որոնումը պահպանվեց',
    savedBody: 'Նոր հայտարարությունների մասին կտեղեկացնենք։',
    errorTitle: 'Չհաջողվեց պահպանել',
    close: 'Փակել',
    confirmTitle: 'Հեռացնե՞լ որոնումը',
    confirmBody: 'Այս գործողությունը հնարավոր չէ հետարկել։',
  },
  ru: {
    language: 'Русский',
    save: 'Сохранить',
    cancel: 'Отмена',
    longAction: 'Получить заключение об оценке',
    districtLabel: 'Административный район',
    districtHint: 'Выберите один из 12 районов Еревана',
    districtError: 'Пожалуйста, выберите район',
    placeholder: 'Выберите район',
    notesLabel: 'Дополнительные заметки',
    heading: 'Почему SmartEstate',
    paragraph:
      'Построено на рыночных данных в реальном времени и машинном обучении, чтобы вы принимали уверенные решения.',
    verdict: 'Цена ниже рыночной',
    overview: 'Обзор',
    details: 'Подробности',
    history: 'История цен',
    tooltip: 'Рассчитано по средней цене за квадратный метр',
    savedTitle: 'Поиск сохранён',
    savedBody: 'Мы сообщим вам о новых объявлениях.',
    errorTitle: 'Не удалось сохранить',
    close: 'Закрыть',
    confirmTitle: 'Удалить поиск?',
    confirmBody: 'Это действие нельзя отменить.',
  },
  en: {
    language: 'English',
    save: 'Save',
    cancel: 'Cancel',
    longAction: 'Get my valuation verdict',
    districtLabel: 'Administrative district',
    districtHint: 'Choose one of the 12 districts of Yerevan',
    districtError: 'Please choose a district',
    placeholder: 'Choose a district',
    notesLabel: 'Anything else worth mentioning',
    heading: 'Why SmartEstate',
    paragraph:
      'Built on real-time market data and machine learning, so you can make confident decisions.',
    verdict: 'Priced below the market',
    overview: 'Overview',
    details: 'Details',
    history: 'Price history',
    tooltip: 'Calculated from the median price per square metre',
    savedTitle: 'Search saved',
    savedBody: 'We will tell you about new listings.',
    errorTitle: 'Could not save',
    close: 'Close',
    confirmTitle: 'Delete this search?',
    confirmBody: 'This action cannot be undone.',
  },
};

export const DISTRICT_OPTIONS = [
  { value: 'kentron', label: 'Կենտրոն · Кентрон · Kentron' },
  { value: 'arabkir', label: 'Արաբկիր · Арабкир · Arabkir' },
  { value: 'nor-nork', label: 'Նոր Նորք · Нор Норк · Nor Nork' },
];

/**
 * Renders one column per language, each carrying the matching `lang` so the
 * correct font is selected. Every primitive's story uses it, which is how the
 * brief's "verify each primitive in all three languages" is satisfied without
 * writing three stories per component.
 */
export function LocaleShowcase({
  children,
}: {
  children: (copy: SampleCopy, locale: SampleLocale) => ReactNode;
}): JSX.Element {
  return (
    <div className="grid gap-8 md:grid-cols-3">
      {SAMPLE_LOCALES.map((locale) => (
        <div key={locale} lang={locale} className="flex flex-col gap-4">
          <p className="font-body text-xs font-semibold uppercase tracking-wide text-text-muted">
            {SAMPLE[locale].language} · {locale}
          </p>
          {children(SAMPLE[locale], locale)}
        </div>
      ))}
    </div>
  );
}
