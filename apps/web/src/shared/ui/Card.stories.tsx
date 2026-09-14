import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge.js';
import { Button } from './Button.js';
import { Card, CardBody, CardFooter, CardHeader } from './Card.js';
import { LocaleShowcase } from './stories/strings.js';
import { Heading, Text } from './typography.js';

const meta = {
  title: 'Primitives/Card',
  component: Card,
  parameters: {
    docs: {
      description: {
        component:
          'The design separates surfaces with a hairline and a 24px radius and uses no shadow anywhere, so `elevated` exists only for layers that genuinely float, such as a modal or a toast.',
      },
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
  render: () => (
    <div className="grid gap-4 md:grid-cols-2">
      <Card tone="surface">
        <Text>Surface, the default: white with a hairline.</Text>
      </Card>
      <Card tone="muted">
        <Text>Muted, the recessed fill the design uses for feature cards.</Text>
      </Card>
      <Card tone="accent">
        <Text>Accent, tinted with the lime brand colour.</Text>
      </Card>
      <Card tone="outline">
        <Text>Outline, transparent with a hairline.</Text>
      </Card>
    </div>
  ),
};

export const Padding: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Card padding="sm">
        <Text size="sm">Small padding</Text>
      </Card>
      <Card padding="md">
        <Text size="sm">Medium padding, the default</Text>
      </Card>
      <Card padding="lg">
        <Text size="sm">Large padding</Text>
      </Card>
    </div>
  ),
};

export const Composed: Story = {
  render: () => (
    <Card as="article" className="max-w-md">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <Heading as="h3" size="sm">
            Komitas 12
          </Heading>
          <Badge tone="success">Underpriced</Badge>
        </div>
        <Text size="sm" tone="muted">
          Arabkir · 3 rooms · 72 m²
        </Text>
      </CardHeader>
      <CardBody>
        <Text>
          Renovated apartment on the fourth floor of a nine-storey stone building, with a lift.
        </Text>
      </CardBody>
      <CardFooter>
        <Button size="sm">View listing</Button>
        <Button size="sm" variant="ghost">
          Compare
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const AllLanguages: Story = {
  render: () => (
    <LocaleShowcase>
      {(copy) => (
        <Card tone="muted">
          <Heading as="h3" size="sm" className="mb-3">
            {copy.heading}
          </Heading>
          <Text size="sm">{copy.paragraph}</Text>
        </Card>
      )}
    </LocaleShowcase>
  ),
};
