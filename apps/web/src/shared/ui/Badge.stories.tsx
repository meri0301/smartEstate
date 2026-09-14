import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge.js';
import { LocaleShowcase } from './stories/strings.js';

const meta = {
  title: 'Primitives/Badge',
  component: Badge,
  args: { children: 'Fair price' },
  parameters: {
    docs: {
      description: {
        component:
          'Every tone pairs a subtle background with ink that clears AA against it, and the token tests assert those ratios, so a new tone cannot be added without meeting them. The design’s amber is used only as a star fill because it is 1.8:1 on the page and cannot carry text.',
      },
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge tone="neutral">Neutral</Badge>
      <Badge tone="accent">Accent</Badge>
      <Badge tone="success">Underpriced</Badge>
      <Badge tone="warning">Documents missing</Badge>
      <Badge tone="danger">Overpriced</Badge>
      <Badge tone="info">Machine translated</Badge>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge size="sm">Small</Badge>
      <Badge size="md">Medium</Badge>
    </div>
  ),
};

/**
 * A badge whose meaning lives in an abbreviation needs a spoken form; the
 * visible text is then hidden from assistive technology to avoid it being read
 * twice.
 */
export const ScreenReaderLabel: Story = {
  render: () => (
    <Badge tone="success" srLabel="Priced 12 percent below the estimate">
      −12%
    </Badge>
  ),
};

export const AllLanguages: Story = {
  render: () => (
    <LocaleShowcase>
      {(copy) => (
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">{copy.verdict}</Badge>
          <Badge tone="info">{copy.language}</Badge>
        </div>
      )}
    </LocaleShowcase>
  ),
};
