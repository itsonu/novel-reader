'use client';
// The command palette is opened by an event rather than a prop, so any button anywhere
// (the header, the empty library, a keyboard shortcut) can summon the one instance
// mounted in the root layout.

export const COMMAND_EVENT = 'nr:command';
export const openCommand = () => window.dispatchEvent(new CustomEvent(COMMAND_EVENT));
