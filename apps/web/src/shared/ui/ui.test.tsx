import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from './Badge.js';
import { Button } from './Button.js';
import { Card } from './Card.js';
import { Input, Textarea } from './Input.js';
import { Modal } from './Modal.js';
import { Select } from './Select.js';
import { Skeleton, SkeletonText } from './Skeleton.js';
import { Tabs } from './Tabs.js';
import { ToastProvider, useToast } from './Toast.js';
import { Tooltip } from './Tooltip.js';
import { Heading } from './typography.js';

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Գնալ</Button>);
    expect(screen.getByRole('button', { name: 'Գնալ' })).toHaveAttribute('type', 'button');
  });

  it('reports and enforces the loading state', async () => {
    const onClick = vi.fn();
    render(
      <Button isLoading loadingLabel="Загрузка…" onClick={onClick}>
        Отправить
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Загрузка…');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('lets a caller override a conflicting utility', () => {
    render(<Button className="rounded-none">Save</Button>);
    const className = screen.getByRole('button').className;
    expect(className).toContain('rounded-none');
    expect(className).not.toContain('rounded-full');
  });

  it('hides decorative icons from assistive technology', () => {
    render(<Button iconStart={<span data-testid="icon">★</span>}>Rate</Button>);
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden');
  });
});

describe('Input', () => {
  it('associates the label, and describes the control with its hint', () => {
    render(<Input label="Էլ. փոստ" hint="Մենք չենք կիսվի այն" />);
    const input = screen.getByLabelText('Էլ. փոստ');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent('Մենք չենք կիսվի այն');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('marks the control invalid and announces the error', () => {
    render(<Input label="Email" error="Неверный адрес" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Неверный адрес');
  });

  it('replaces the hint with the error rather than showing both', () => {
    render(<Input label="Email" hint="Helper" error="Broken" />);
    expect(screen.queryByText('Helper')).not.toBeInTheDocument();
    expect(screen.getByText('Broken')).toBeInTheDocument();
  });

  it('keeps a visually hidden label reachable', () => {
    render(<Input label="Որոնել" hideLabel />);
    expect(screen.getByLabelText('Որոնել')).toBeInTheDocument();
  });

  it('generates unique ids for repeated fields', () => {
    render(
      <>
        <Input label="One" />
        <Input label="Two" />
      </>,
    );
    expect(screen.getByLabelText('One').id).not.toBe(screen.getByLabelText('Two').id);
  });

  it('supports a multi-line control with the same contract', () => {
    render(<Textarea label="Նշումներ" hint="Ըստ ցանկության" />);
    expect(screen.getByLabelText('Նշումներ').tagName).toBe('TEXTAREA');
  });
});

describe('Select', () => {
  const options = [
    { value: 'kentron', label: 'Կենտրոն' },
    { value: 'arabkir', label: 'Արաբկիր' },
    { value: 'avan', label: 'Ավան', disabled: true },
  ];

  it('renders the options and a disabled placeholder', () => {
    render(<Select label="Շրջան" options={options} placeholder="Ընտրեք" />);
    const select = screen.getByLabelText('Շրջան');
    expect(within(select).getByRole('option', { name: 'Ընտրեք' })).toBeDisabled();
    expect(within(select).getByRole('option', { name: 'Ավան' })).toBeDisabled();
    expect(within(select).getAllByRole('option')).toHaveLength(4);
  });

  it('reports the chosen value', async () => {
    const onChange = vi.fn();
    render(<Select label="District" options={options} placeholder="Pick" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('District'), 'arabkir');
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText('District')).toHaveValue('arabkir');
  });
});

describe('Tabs', () => {
  const items = [
    { id: 'a', label: 'Ակնարկ', content: <p>Բովանդակություն Ա</p> },
    { id: 'b', label: 'Обзор', content: <p>Content B</p> },
    { id: 'c', label: 'Disabled', content: <p>Content C</p>, disabled: true },
  ];

  it('exposes one tab stop and shows only the selected panel', () => {
    render(<Tabs items={items} label="Sections" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Բովանդակություն Ա')).toBeInTheDocument();
    expect(screen.queryByText('Content B')).not.toBeInTheDocument();
  });

  it('moves with the arrow keys and skips disabled tabs', async () => {
    render(<Tabs items={items} label="Sections" />);
    const tabs = screen.getAllByRole('tab');
    tabs[0]?.focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Content B')).toBeInTheDocument();

    // Only two tabs are enabled, so the next step wraps back to the first.
    await userEvent.keyboard('{ArrowRight}');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{End}');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('reports the change to a controlling parent', async () => {
    const onValueChange = vi.fn();
    render(<Tabs items={items} label="Sections" value="a" onValueChange={onValueChange} />);
    const [, secondTab] = screen.getAllByRole('tab');
    if (secondTab === undefined) {
      throw new Error('expected at least two tabs');
    }
    await userEvent.click(secondTab);
    expect(onValueChange).toHaveBeenCalledWith('b');
    // Controlled: the parent decides, so the selection has not moved on its own.
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Modal', () => {
  function Harness({ onClose }: { onClose: () => void }) {
    return (
      <Modal open title="Հաստատում" description="Համոզվա՞ծ եք" closeLabel="Փակել" onClose={onClose}>
        <p>Մարմին</p>
      </Modal>
    );
  }

  it('is labelled and described by its own heading and lead', () => {
    render(<Harness onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(within(dialog).getByRole('heading', { name: 'Հաստատում' })).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
  });

  it('closes from the close control', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Փակել' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays closed until asked to open', () => {
    render(
      <Modal open={false} title="Hidden" closeLabel="Close" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
  });
});

describe('Tooltip', () => {
  it('describes its trigger only while visible, and closes on Escape', async () => {
    render(
      <Tooltip content="Գինը մեկ քմ-ի համար">
        <button type="button">Info</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Info' });
    expect(trigger).not.toHaveAttribute('aria-describedby');

    await userEvent.tab();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-describedby');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Գինը մեկ քմ-ի համար');

    await userEvent.keyboard('{Escape}');
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });
});

describe('Toast', () => {
  function Harness() {
    const { show } = useToast();
    return (
      <>
        <button type="button" onClick={() => show({ title: 'Պահպանվեց', duration: 0 })}>
          save
        </button>
        <button type="button" onClick={() => show({ title: 'Սխալ', tone: 'danger', duration: 0 })}>
          fail
        </button>
      </>
    );
  }

  const renderHarness = () =>
    render(
      <ToastProvider regionLabel="Ծանուցումներ" dismissLabel="Փակել">
        <Harness />
      </ToastProvider>,
    );

  it('announces a normal message as a status and an error as an alert', async () => {
    renderHarness();
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(screen.getByRole('status')).toHaveTextContent('Պահպանվեց');

    await userEvent.click(screen.getByRole('button', { name: 'fail' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Սխալ');
  });

  it('dismisses on request', async () => {
    renderHarness();
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await userEvent.click(screen.getByRole('button', { name: 'Փակել' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('refuses to work outside its provider', () => {
    const Broken = () => {
      useToast();
      return null;
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Broken />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe('presentational primitives', () => {
  it('Badge prefers a screen-reader label when the visible text is an abbreviation', () => {
    render(
      <Badge tone="success" srLabel="Underpriced by 12 percent">
        −12%
      </Badge>,
    );
    expect(screen.getByText('Underpriced by 12 percent')).toBeInTheDocument();
    expect(screen.getByText('−12%')).toHaveAttribute('aria-hidden');
  });

  it('Skeleton is hidden from assistive technology', () => {
    const { container } = render(<SkeletonText lines={3} />);
    const placeholders = container.querySelectorAll('[aria-hidden]');
    expect(placeholders).toHaveLength(3);
    render(<Skeleton shape="circle" className="size-10" />);
  });

  it('Card renders the requested element', () => {
    render(
      <Card as="article" aria-label="Listing">
        <Heading as="h3">Բնակարան</Heading>
      </Card>,
    );
    expect(screen.getByRole('article', { name: 'Listing' })).toBeInTheDocument();
  });

  it('Heading keeps rank and appearance independent', () => {
    render(
      <Heading as="h1" size="sm">
        Small but first
      </Heading>,
    );
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.className).toContain('text-lg');
  });
});

describe('controlled and uncontrolled state', () => {
  it('Tabs can be driven entirely by a parent', async () => {
    function Controlled() {
      const [value, setValue] = useState('a');
      return (
        <Tabs
          label="Sections"
          value={value}
          onValueChange={setValue}
          items={[
            { id: 'a', label: 'A', content: <p>Panel A</p> },
            { id: 'b', label: 'B', content: <p>Panel B</p> },
          ]}
        />
      );
    }
    render(<Controlled />);
    await userEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(screen.getByText('Panel B')).toBeInTheDocument();
  });
});
