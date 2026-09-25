'use client';
// Everything app-wide that isn't a page: the toast region, the command palette (loaded
// on first use), and the watcher that follows the OS theme while the reader has asked
// the app to. Mounted once in the root layout; survives every client navigation.

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import Toaster from './Toaster';
import { COMMAND_EVENT } from './commands';
import { watchTheme } from '@/lib/theme';
import { isTyping } from '@/lib/ui';

const CommandPalette = dynamic(() => import('./CommandPalette'), { ssr: false });

export default function AppChrome() {
  const [cmd, setCmd] = useState(false);
  const [wanted, setWanted] = useState(false);   // has the palette ever been asked for?

  useEffect(() => watchTheme(() => {}), []);

  useEffect(() => {
    const open = () => { setWanted(true); setCmd(true); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        // The editor owns ⌘K (insert link) while you're writing.
        if (isTyping(e) && document.querySelector('[data-editor]')) return;
        e.preventDefault();
        setWanted(true);
        setCmd(c => !c);
      }
    };
    window.addEventListener(COMMAND_EVENT, open);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener(COMMAND_EVENT, open); window.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <>
      <Toaster />
      {wanted && <CommandPalette open={cmd} onClose={() => setCmd(false)} />}
    </>
  );
}
