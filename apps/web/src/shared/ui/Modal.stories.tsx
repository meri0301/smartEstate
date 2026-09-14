import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from './Button.js';
import { Modal } from './Modal.js';
import { SAMPLE, SAMPLE_LOCALES } from './stories/strings.js';
import { Text } from './typography.js';

const meta = {
  title: 'Primitives/Modal',
  component: Modal,
  // Each story drives its own open state, so these only satisfy the required props.
  args: { open: false, onClose: () => undefined, title: '', closeLabel: 'Close' },
  parameters: {
    docs: {
      description: {
        component:
          'Built on the native `<dialog>`, which supplies the focus trap, the Escape handler, the inert background and the top layer. Writing those by hand is the most common source of accessibility bugs in a modal, so the platform does it and this component only manages open state and layout.',
      },
    },
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ locale = 'en' }: { locale?: (typeof SAMPLE_LOCALES)[number] }) {
  const copy = SAMPLE[locale];
  const [open, setOpen] = useState(false);
  return (
    <div lang={locale}>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        {copy.confirmTitle}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={copy.confirmTitle}
        description={copy.confirmBody}
        closeLabel={copy.close}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
              }}
            >
              {copy.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setOpen(false);
              }}
            >
              {copy.save}
            </Button>
          </>
        }
      >
        <Text size="sm" tone="muted">
          {copy.paragraph}
        </Text>
      </Modal>
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };

export const AllLanguages: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      {SAMPLE_LOCALES.map((locale) => (
        <Demo key={locale} locale={locale} />
      ))}
    </div>
  ),
};
