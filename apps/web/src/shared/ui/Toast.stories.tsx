import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button.js';
import { SAMPLE, SAMPLE_LOCALES, type SampleLocale } from './stories/strings.js';
import { ToastProvider, useToast } from './Toast.js';

const meta = {
  title: 'Primitives/Toast',
  component: ToastProvider,
  parameters: {
    docs: {
      description: {
        component:
          'Transient notifications in a live region, so a message is announced without stealing focus. Errors use `role="alert"` and are assertive; everything else is polite. Auto-dismissal pauses while the pointer is over the region, so a message cannot vanish mid-sentence.',
      },
    },
  },
} satisfies Meta<typeof ToastProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

function Triggers({ locale }: { locale: SampleLocale }) {
  const copy = SAMPLE[locale];
  const { show } = useToast();
  return (
    <div lang={locale} className="flex flex-wrap gap-3">
      <Button
        size="sm"
        onClick={() => {
          show({ title: copy.savedTitle, description: copy.savedBody, tone: 'success' });
        }}
      >
        {copy.save}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          show({ title: copy.errorTitle, description: copy.districtError, tone: 'danger' });
        }}
      >
        {copy.errorTitle}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          show({ title: copy.tooltip, tone: 'info', duration: 0 });
        }}
      >
        {copy.details}
      </Button>
    </div>
  );
}

export const Default: Story = {
  args: { regionLabel: 'Notifications', dismissLabel: 'Dismiss', children: null },
  render: (args) => (
    <ToastProvider {...args}>
      <Triggers locale="en" />
    </ToastProvider>
  ),
};

export const AllLanguages: Story = {
  args: { regionLabel: 'Notifications', dismissLabel: 'Dismiss', children: null },
  render: () => (
    <div className="flex flex-col gap-6">
      {SAMPLE_LOCALES.map((locale) => (
        <ToastProvider
          key={locale}
          regionLabel={SAMPLE[locale].savedTitle}
          dismissLabel={SAMPLE[locale].close}
        >
          <Triggers locale={locale} />
        </ToastProvider>
      ))}
    </div>
  ),
};
