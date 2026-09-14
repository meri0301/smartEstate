import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select } from './Select.js';
import { DISTRICT_OPTIONS, LocaleShowcase } from './stories/strings.js';

const meta = {
  title: 'Primitives/Select',
  component: Select,
  args: {
    label: 'Administrative district',
    options: DISTRICT_OPTIONS,
    placeholder: 'Choose a district',
  },
  parameters: {
    docs: {
      description: {
        component:
          'Built on the native control. A custom listbox would match the chevron and menu of the design more exactly, but the native element brings correct keyboard behaviour, screen-reader support and the platform picker on mobile, and the design’s own select is a plain field with a chevron.',
      },
    },
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: { hint: 'Choose one of the 12 districts of Yerevan' },
};

export const Invalid: Story = {
  args: { error: 'Please choose a district', required: true },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'kentron' },
};

export const WithDisabledOption: Story = {
  args: {
    options: [
      ...DISTRICT_OPTIONS,
      { value: 'nubarashen', label: 'Nubarashen (no listings)', disabled: true },
    ],
  },
};

export const AllLanguages: Story = {
  render: () => (
    <LocaleShowcase>
      {(copy) => (
        <>
          <Select
            label={copy.districtLabel}
            options={DISTRICT_OPTIONS}
            placeholder={copy.placeholder}
            hint={copy.districtHint}
          />
          <Select
            label={copy.districtLabel}
            options={DISTRICT_OPTIONS}
            placeholder={copy.placeholder}
            error={copy.districtError}
          />
        </>
      )}
    </LocaleShowcase>
  ),
};
