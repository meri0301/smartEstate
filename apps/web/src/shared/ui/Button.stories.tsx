import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button.js';
import { LocaleShowcase } from './stories/strings.js';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Get my verdict' },
  parameters: {
    docs: {
      description: {
        component:
          'The design draws a lime pill with dark ink, plus a dark pill for the closing call to action. The remaining variants are the minimum an application needs, built from the same tokens.',
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-4">
      <Button {...args} variant="primary">
        Primary
      </Button>
      <Button {...args} variant="inverse">
        Inverse
      </Button>
      <Button {...args} variant="outline">
        Outline
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
      <Button {...args} variant="danger">
        Danger
      </Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-4">
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="md">
        Medium
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
};

export const States: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-4">
      <Button {...args}>Default</Button>
      <Button {...args} disabled>
        Disabled
      </Button>
      <Button {...args} isLoading loadingLabel="Working…">
        Loading
      </Button>
      <Button {...args} block className="max-w-xs">
        Full width
      </Button>
    </div>
  ),
};

/**
 * The Armenian label is roughly 40% wider than the English one, which is where
 * a fixed-width button would break.
 */
export const AllLanguages: Story = {
  render: () => (
    <LocaleShowcase>
      {(copy) => (
        <div className="flex flex-col items-start gap-3">
          <Button>{copy.longAction}</Button>
          <Button variant="outline">{copy.cancel}</Button>
          <Button variant="inverse" size="sm">
            {copy.save}
          </Button>
        </div>
      )}
    </LocaleShowcase>
  ),
};
