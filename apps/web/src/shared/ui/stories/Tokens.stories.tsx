import {
  colorTokens,
  contrast,
  cssVarName,
  darkColorTokens,
  radiusTokens,
  spacingTokens,
  tokenGroups,
  type Token,
} from '@smartestate/ui-tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { JSX } from 'react';
import { Text } from '../typography.js';

const meta = {
  title: 'Foundations/Tokens',
  parameters: {
    docs: {
      description: {
        component:
          'Every value the design system exposes, and where it came from. `figma` means the value was read from the SmartEstate Figma file; `derived` means the design did not define it and the note records the reasoning. The design is light-only with no shadows, so the whole dark theme and the status colours are necessarily derived.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function SourceTag({ token }: { token: Token }): JSX.Element {
  return (
    <span
      className={
        token.source === 'figma'
          ? 'rounded-xs bg-accent-subtle px-1.5 py-px text-xs text-text'
          : 'rounded-xs bg-surface-muted px-1.5 py-px text-xs text-text-muted'
      }
    >
      {token.source}
    </span>
  );
}

export const Colour: Story = {
  render: () => (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-border">
          {['Swatch', 'Token', 'Light', 'Dark', 'Source', 'Why'].map((head) => (
            <th
              key={head}
              className="p-2 font-body text-xs font-semibold uppercase text-text-muted"
            >
              {head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Object.entries(colorTokens).map(([key, token]) => (
          <tr key={key} className="border-b border-border align-top">
            <td className="p-2">
              <span
                className="inline-block size-8 rounded-xs border border-border"
                style={{ background: `var(${cssVarName('color', key)})` }}
              />
            </td>
            <td className="p-2 font-mono text-xs text-text">{cssVarName('color', key)}</td>
            <td className="p-2 font-mono text-xs text-text-muted">{token.value}</td>
            <td className="p-2 font-mono text-xs text-text-muted">{darkColorTokens[key]?.value}</td>
            <td className="p-2">
              <SourceTag token={token} />
            </td>
            <td className="p-2 text-xs text-text-muted">{token.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
};

/** The ratios the token tests assert, shown so they can be quoted directly. */
export const Contrast: Story = {
  render: () => {
    const pairs: [string, string][] = [
      ['text', 'bg'],
      ['text-secondary', 'bg'],
      ['text-muted', 'surface-muted'],
      ['text-placeholder', 'surface-muted'],
      ['on-accent', 'accent'],
      ['success', 'success-subtle'],
      ['warning', 'warning-subtle'],
      ['danger', 'danger-subtle'],
      ['info', 'info-subtle'],
      ['border-interactive', 'surface'],
    ];
    return (
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            {['Foreground', 'Background', 'Light', 'Dark'].map((head) => (
              <th
                key={head}
                className="p-2 font-body text-xs font-semibold uppercase text-text-muted"
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pairs.map(([fg, bg]) => (
            <tr key={`${fg}-${bg}`} className="border-b border-border">
              <td className="p-2 font-mono text-xs text-text">{fg}</td>
              <td className="p-2 font-mono text-xs text-text-muted">{bg}</td>
              <td className="p-2 font-mono text-xs text-text-muted">
                {contrast(
                  colorTokens[fg]?.value ?? '#000',
                  colorTokens[bg]?.value ?? '#fff',
                ).toFixed(2)}
              </td>
              <td className="p-2 font-mono text-xs text-text-muted">
                {contrast(
                  darkColorTokens[fg]?.value ?? '#000',
                  darkColorTokens[bg]?.value ?? '#fff',
                ).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
};

export const Shape: Story = {
  render: () => (
    <div className="flex flex-wrap items-end gap-6">
      {Object.entries(radiusTokens).map(([key, token]) => (
        <div key={key} className="flex flex-col items-center gap-2">
          <div
            className="size-20 bg-accent-subtle border border-border"
            style={{ borderRadius: `var(${cssVarName('radius', key)})` }}
          />
          <Text size="xs" tone="muted">
            {key} · {token.value}
          </Text>
        </div>
      ))}
    </div>
  ),
};

export const Spacing: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {Object.entries(spacingTokens).map(([key, token]) => (
        <div key={key} className="flex items-center gap-4">
          <span className="w-12 font-mono text-xs text-text-muted">{key}</span>
          <span className="h-3 bg-accent" style={{ width: `var(${cssVarName('space', key)})` }} />
          <span className="font-mono text-xs text-text-muted">{token.value}</span>
        </div>
      ))}
    </div>
  ),
};

export const Inventory: Story = {
  render: () => {
    const rows = tokenGroups.map((group) => {
      const values = Object.values(group.tokens);
      return {
        label: group.label,
        total: values.length,
        figma: values.filter((token) => token.source === 'figma').length,
      };
    });
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const figma = rows.reduce((sum, row) => sum + row.figma, 0);
    return (
      <table className="border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            {['Group', 'Tokens', 'From Figma', 'Derived'].map((head) => (
              <th
                key={head}
                className="p-2 font-body text-xs font-semibold uppercase text-text-muted"
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border">
              <td className="p-2 text-sm text-text">{row.label}</td>
              <td className="p-2 font-mono text-xs text-text-muted">{row.total}</td>
              <td className="p-2 font-mono text-xs text-text-muted">{row.figma}</td>
              <td className="p-2 font-mono text-xs text-text-muted">{row.total - row.figma}</td>
            </tr>
          ))}
          <tr>
            <td className="p-2 text-sm font-semibold text-text">Total</td>
            <td className="p-2 font-mono text-xs text-text">{total}</td>
            <td className="p-2 font-mono text-xs text-text">{figma}</td>
            <td className="p-2 font-mono text-xs text-text">{total - figma}</td>
          </tr>
        </tbody>
      </table>
    );
  },
};
