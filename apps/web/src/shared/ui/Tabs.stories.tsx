import type { Meta, StoryObj } from '@storybook/react-vite';
import { LocaleShowcase } from './stories/strings.js';
import { Tabs } from './Tabs.js';
import { Text } from './typography.js';

const meta = {
  title: 'Primitives/Tabs',
  component: Tabs,
  parameters: {
    docs: {
      description: {
        component:
          'Follows the WAI-ARIA authoring practice: one stop in the tab order for the whole list, arrow keys to move, Home and End to jump, selection following focus, and disabled tabs skipped rather than focused. Try it from the keyboard.',
      },
    },
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Listing sections',
    items: [
      { id: 'overview', label: 'Overview', content: <Text>Price, size and location.</Text> },
      { id: 'details', label: 'Details', content: <Text>Building type, floor, heating.</Text> },
      { id: 'history', label: 'Price history', content: <Text>How the asking price moved.</Text> },
    ],
  },
};

export const WithDisabledTab: Story = {
  args: {
    label: 'Listing sections',
    items: [
      { id: 'overview', label: 'Overview', content: <Text>Price, size and location.</Text> },
      {
        id: 'valuation',
        label: 'Valuation',
        content: <Text>Fair-price estimate.</Text>,
        disabled: true,
      },
      { id: 'history', label: 'Price history', content: <Text>How the asking price moved.</Text> },
    ],
  },
};

export const AllLanguages: Story = {
  args: { label: 'Listing sections', items: [] },
  render: () => (
    <LocaleShowcase>
      {(copy, locale) => (
        <Tabs
          label={copy.overview}
          items={[
            {
              id: `${locale}-a`,
              label: copy.overview,
              content: <Text size="sm">{copy.paragraph}</Text>,
            },
            {
              id: `${locale}-b`,
              label: copy.details,
              content: <Text size="sm">{copy.verdict}</Text>,
            },
            {
              id: `${locale}-c`,
              label: copy.history,
              content: <Text size="sm">{copy.tooltip}</Text>,
            },
          ]}
        />
      )}
    </LocaleShowcase>
  ),
};
