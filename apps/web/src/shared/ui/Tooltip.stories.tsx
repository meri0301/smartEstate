import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button.js';
import { LocaleShowcase } from './stories/strings.js';
import { Tooltip } from './Tooltip.js';

const meta = {
  title: 'Primitives/Tooltip',
  component: Tooltip,
  parameters: {
    docs: {
      description: {
        component:
          'A supplementary label for a control that already has an accessible name. It opens on hover and on keyboard focus, is wired with `aria-describedby` rather than `title`, and closes on Escape. It is not a substitute for a label: if the trigger has no name of its own, give it one.',
      },
    },
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    content: 'Calculated from the median price per square metre',
    children: (
      <Button variant="outline" size="sm">
        Price per m²
      </Button>
    ),
  },
};

export const Below: Story = {
  args: { ...Default.args, placement: 'bottom' },
};

export const AllLanguages: Story = {
  args: { content: '', children: <span /> },
  render: () => (
    <LocaleShowcase>
      {(copy) => (
        <Tooltip content={copy.tooltip}>
          <Button variant="outline" size="sm">
            {copy.details}
          </Button>
        </Tooltip>
      )}
    </LocaleShowcase>
  ),
};
