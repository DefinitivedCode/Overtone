import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Banner,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Menu,
  ProgressBar,
  SegmentedControl,
  Sheet,
  Switch,
  TextArea,
  TextField,
  ToastProvider,
  useToast,
} from './index';

describe('IconButton / Button', () => {
  it('exposes the label as the accessible name', () => {
    render(<IconButton label="Settings">x</IconButton>);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });
  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('SegmentedControl', () => {
  it('is a labelled radiogroup and reports changes', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Theme"
        value="system"
        options={[
          { value: 'system', label: 'System' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});

describe('Switch', () => {
  it('has the switch role and toggles with the keyboard', async () => {
    const onChange = vi.fn();
    render(<Switch label="Show romaji" checked={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Show romaji' });
    sw.focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('TextField / TextArea', () => {
  it('links label, marks invalid and announces the error', () => {
    render(<TextField label="Title" error="Title is required" defaultValue="" />);
    const input = screen.getByLabelText('Title');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required');
    expect(input).toHaveAccessibleDescription('Title is required');
  });
  it('TextArea renders the requested minimum rows', () => {
    render(<TextArea label="Lyrics" value="" onChange={() => undefined} minRows={8} />);
    expect(screen.getByLabelText('Lyrics')).toHaveAttribute('rows', '8');
  });
});

describe('ProgressBar', () => {
  it('exposes progress only when labelled', () => {
    const { rerender } = render(<ProgressBar value={0.6} label="Learned" />);
    expect(screen.getByRole('progressbar', { name: 'Learned' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
    rerender(<ProgressBar value={0.6} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('EmptyState / Banner', () => {
  it('EmptyState has a heading and hides decorative art', () => {
    render(<EmptyState title="Your songbook is empty">Body</EmptyState>);
    expect(screen.getByRole('heading', { name: 'Your songbook is empty' })).toBeInTheDocument();
  });
  it('Banner dismiss works and errors use role=alert', async () => {
    const onDismiss = vi.fn();
    render(
      <Banner tone="error" onDismiss={onDismiss}>
        Broken
      </Banner>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Broken');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('Menu', () => {
  function Demo({ onSelect }: { onSelect: () => void }) {
    return (
      <Menu
        renderTrigger={(p) => (
          <IconButton label="More" {...p}>
            ⋯
          </IconButton>
        )}
        items={[
          { key: 'a', label: 'Edit', onSelect },
          { key: 'b', label: 'Delete', destructive: true, onSelect: () => undefined },
        ]}
      />
    );
  }
  it('opens, moves focus with arrows, selects and returns focus', async () => {
    const onSelect = vi.fn();
    render(<Demo onSelect={onSelect} />);
    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });
  it('Escape closes and restores focus to the trigger', async () => {
    render(<Demo onSelect={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus();
  });
});

describe('Toast', () => {
  beforeEach(() =>
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] }),
  );
  afterEach(() => vi.useRealTimers());

  function Demo({ onUndo }: { onUndo: () => void }) {
    const toast = useToast();
    return (
      <button
        type="button"
        onClick={() =>
          toast.show({ message: 'Song deleted', actionLabel: 'Undo', onAction: onUndo })
        }
      >
        go
      </button>
    );
  }

  it('shows in a polite live region, runs the action and dismisses', async () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Demo onUndo={onUndo} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(screen.getByRole('status')).toHaveTextContent('Song deleted');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalled();
    expect(screen.queryByText('Song deleted')).toBeNull();
  });

  it('auto-dismisses after 8 s when it has an action', async () => {
    render(
      <ToastProvider>
        <Demo onUndo={() => undefined} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    act(() => void vi.advanceTimersByTime(7000));
    expect(screen.queryByText('Song deleted')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1500));
    expect(screen.queryByText('Song deleted')).toBeNull();
  });
});

describe('ConfirmDialog', () => {
  it('is a labelled dialog, focuses Cancel first and wires both buttons', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete song?"
        message="This removes the song and its progress."
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Delete song?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('Sheet', () => {
  function Demo() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          open
        </button>
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title="New Song"
          trailing={
            <Button variant="plain" onClick={() => setOpen(false)}>
              Close
            </Button>
          }
        >
          <input aria-label="Title" />
        </Sheet>
      </>
    );
  }

  it('opens as a labelled modal dialog, locks scroll, pushes history, and closes via the visible control', async () => {
    const push = vi.spyOn(history, 'pushState');
    render(<Demo />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'open' }));
    const dlg = await screen.findByRole('dialog', { name: 'New Song' });
    expect(dlg).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'New Song' })).toHaveFocus());
    expect(document.documentElement.dataset['scrollLocked']).toBe('true');
    expect(push).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.documentElement.dataset['scrollLocked']).toBeUndefined();
    push.mockRestore();
  });

  it('closes on the dialog cancel event (Escape)', async () => {
    render(<Demo />);
    await userEvent.click(screen.getByRole('button', { name: 'open' }));
    const dlg = await screen.findByRole('dialog');
    act(() => void dlg.dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(document.documentElement.dataset['scrollLocked']).toBeUndefined();
  });
});
