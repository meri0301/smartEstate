import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input, Textarea } from './Input.js';
import { LocaleShowcase } from './stories/strings.js';

const meta = {
  title: 'Primitives/Input',
  component: Input,
  args: { label: 'Administrative district', placeholder: 'Choose a district' },
  parameters: {
    docs: {
      description: {
        component:
          'Label, hint and error are part of the component rather than the caller, so the `for`, `aria-describedby` and `aria-invalid` wiring is written once and cannot be forgotten.',
      },
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: { hint: 'Choose one of the 12 districts of Yerevan' },
};

/** The error replaces the hint rather than stacking with it, and is announced. */
export const Invalid: Story = {
  args: {
    hint: 'Choose one of the 12 districts',
    error: 'Please choose a district',
    required: true,
  },
};

export const Disabled: Story = {
  args: { disabled: true, value: 'Kentron' },
};

export const HiddenLabel: Story = {
  args: { label: 'Search listings', hideLabel: true, placeholder: 'Search…' },
};

export const MultiLine: Story = {
  render: () => (
    <Textarea
      label="Anything else worth mentioning"
      hint="View, noise, recent repairs, how long it has been listed"
    />
  ),
};

export const AllLanguages: Story = {
  render: () => (
    <LocaleShowcase>
      {(copy) => (
        <>
          <Input
            label={copy.districtLabel}
            hint={copy.districtHint}
            placeholder={copy.placeholder}
          />
          <Input label={copy.districtLabel} error={copy.districtError} required />
          <Textarea label={copy.notesLabel} rows={3} />
        </>
      )}
    </LocaleShowcase>
  ),
};
