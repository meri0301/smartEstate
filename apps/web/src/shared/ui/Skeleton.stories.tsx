import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, CardBody, CardHeader } from './Card.js';
import { Skeleton, SkeletonText } from './Skeleton.js';

const meta = {
  title: 'Primitives/Skeleton',
  component: Skeleton,
  parameters: {
    docs: {
      description: {
        component:
          'Loading placeholder. Hidden from assistive technology, because the region that is loading should carry `aria-busy` and announcing the placeholders themselves would only add noise. The pulse stops under `prefers-reduced-motion`.',
      },
    },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Shapes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Skeleton shape="heading" className="w-64" />
      <Skeleton shape="text" className="w-96" />
      <Skeleton shape="rect" className="h-24 w-64" />
      <Skeleton shape="card" className="h-32 w-80" />
      <Skeleton shape="circle" className="size-12" />
    </div>
  ),
};

export const Paragraph: Story = {
  render: () => <SkeletonText lines={4} className="max-w-md" />,
};

/**
 * A loading listing card. The container carries `aria-busy`, which is what a
 * screen reader announces; the placeholders inside stay silent.
 */
export const ListingCard: Story = {
  render: () => (
    <Card className="max-w-md" aria-busy aria-label="Loading listing">
      <CardHeader>
        <Skeleton shape="heading" className="w-40" />
        <Skeleton shape="text" className="w-28" />
      </CardHeader>
      <CardBody>
        <Skeleton shape="card" className="h-40 w-full" />
        <SkeletonText lines={2} />
      </CardBody>
    </Card>
  ),
};
