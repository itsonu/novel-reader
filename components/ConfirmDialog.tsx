'use client';
// A real dialog for decisions that can destroy something. Replaces window.confirm(),
// which can't be styled, can't be read by the page's own voice, and on mobile looks
// like the browser is warning you about the site rather than the app asking a question.
//
// Deliberately not a Sheet: a sheet is for choosing, this is for stopping.

import Dialog from './Dialog';

export type Choice = { label: string; onPick: () => void; variant?: 'primary' | 'danger' };

export default function ConfirmDialog({
  open, title, body, choices, onDismiss
}: {
  open: boolean;
  title: string;
  body?: string;
  /** First choice is the safe one and takes focus — the dialog defaults to *not* losing work. */
  choices: Choice[];
  onDismiss: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onDismiss}
      title={title}
      description={body && <p>{body}</p>}
      footer={
        // Visual order puts the destructive choice last (rightmost / bottom-most on a
        // phone's reversed stack); focus order still starts on the safe one.
        choices.map((c, i) => (
          <button
            key={c.label}
            data-autofocus={i === 0 || undefined}
            className="btn"
            data-variant={c.variant === 'primary' ? 'secondary' : c.variant === 'danger' ? 'danger-solid' : 'ghost'}
            onClick={c.onPick}
          >
            {c.label}
          </button>
        ))
      }
    />
  );
}
