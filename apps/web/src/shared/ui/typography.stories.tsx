import type { Meta, StoryObj } from '@storybook/react-vite';
import { LocaleShowcase } from './stories/strings.js';
import { Heading, Text } from './typography.js';

const meta = {
  title: 'Primitives/Typography',
  component: Heading,
  parameters: {
    docs: {
      description: {
        component:
          'Krona One carries the display role and Montserrat the body copy, exactly as the design specifies. Neither covers Armenian, and Krona One has no Cyrillic either, so each locale substitutes a face that contains its script; switch the Locale toolbar to see the substitution.',
      },
    },
  },
} satisfies Meta<typeof Heading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scale: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Heading as="h1" size="xl">
        Display 40
      </Heading>
      <Heading as="h2" size="lg">
        Heading 32
      </Heading>
      <Heading as="h3" size="md">
        Heading 24
      </Heading>
      <Heading as="h4" size="sm">
        Heading 20
      </Heading>
      <Text size="lg">Body large, 20px</Text>
      <Text size="base">Body, 16px, the size the design uses for every paragraph</Text>
      <Text size="sm">Small, 14px</Text>
      <Text size="xs">Caption, 12px</Text>
    </div>
  ),
};

export const Tones: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Text tone="strong">Strong ink for emphasis</Text>
      <Text tone="default">Default body ink</Text>
      <Text tone="muted">Muted, for supporting detail</Text>
      <Text tone="success">Success message</Text>
      <Text tone="danger">Error message</Text>
    </div>
  ),
};

/**
 * Headings are uppercase by design, but user-generated content such as a street
 * name should not be shouted, so the transform can be turned off.
 */
export const HeadingTransform: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Heading as="h3">Uppercase by default</Heading>
      <Heading as="h3" transform="none">
        Komitas Avenue 12, Arabkir
      </Heading>
    </div>
  ),
};

export const AllLanguages: Story = {
  render: () => (
    <LocaleShowcase>
      {(copy) => (
        <>
          <Heading as="h3" size="md">
            {copy.heading}
          </Heading>
          <Text>{copy.paragraph}</Text>
        </>
      )}
    </LocaleShowcase>
  ),
};
