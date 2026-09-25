'use client';
// Theme control for the app chrome. Shows the preference you chose (the system glyph
// while following the OS), and offers all three — a cycling button would make you
// guess what the next press does.

import { useEffect, useState } from 'react';
import Menu from './Menu';
import Icon from './Icon';
import { getThemePref, setThemePref, watchTheme, type ThemePref } from '@/lib/theme';

const LABEL: Record<ThemePref, string> = { system: 'Match system', light: 'Light', dark: 'Dark' };
const GLYPH = { system: 'system', light: 'sun', dark: 'moon' } as const;

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>('system');
  useEffect(() => { setPref(getThemePref()); return watchTheme(setPref); }, []);
  return [pref, setThemePref];
}

export default function ThemeMenu() {
  const [pref, set] = useThemePref();
  return (
    <Menu
      label={`Appearance: ${LABEL[pref]}`}
      trigger={<Icon name={GLYPH[pref]} size={19} />}
      className="theme-menu"
      iconOnly
      items={(['system', 'light', 'dark'] as ThemePref[]).map(p => ({
        label: LABEL[p], icon: GLYPH[p], checked: pref === p, onSelect: () => set(p)
      }))}
    />
  );
}

/** The same choice as a segmented control, for settings panels. */
export function ThemeSegmented() {
  const [pref, set] = useThemePref();
  return (
    <div className="seg" role="radiogroup" aria-label="Appearance">
      {(['light', 'dark', 'system'] as ThemePref[]).map(p => (
        <button key={p} role="radio" aria-checked={pref === p} onClick={() => set(p)}>
          <Icon name={GLYPH[p]} size={16} />
          {p === 'system' ? 'Auto' : LABEL[p]}
        </button>
      ))}
    </div>
  );
}
