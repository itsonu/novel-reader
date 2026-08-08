'use client';
// First-run tour. Loaded lazily — a returning reader never pays for it.
// ponytail: driver.js (~5KB gz, MIT) instead of hand-rolling spotlight + focus
// trapping + scroll-into-view. That's the one thing worth a dependency here.

const SEEN = 'nr:tour';

export const tourSeen = () =>
  typeof window !== 'undefined' && localStorage.getItem(SEEN) === '1';

export async function runTour(force = false) {
  if (typeof window === 'undefined') return;
  if (!force && tourSeen()) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches && !force) {
    // Still mark it seen: a spotlight that can't animate is worse than none.
    localStorage.setItem(SEEN, '1');
    return;
  }

  const { driver } = await import('driver.js');

  const steps = [
    {
      element: '.player .ctl.primary',
      popover: {
        title: 'Press play',
        description: 'A narrator reads the chapter aloud and the page follows along, word by word. Space works too.'
      }
    },
    {
      element: '.scrub',
      popover: {
        title: 'Scrub anywhere',
        description: 'Drag to move through the chapter. You can also click any word in the text to start reading from there.'
      }
    },
    {
      element: '[aria-label="Cinematic effects"]',
      popover: {
        title: 'Cinematic effects',
        description: 'Optional. When the prose turns — a storm, an impact, a silence — the page reacts on the exact word being spoken. Off by default.'
      }
    },
    {
      element: '[aria-label="Settings"]',
      popover: {
        title: 'Voices and speed',
        description: 'Your device speaks instantly. Better neural voices download once, then work offline forever.'
      }
    },
    {
      element: '.libbtn',
      popover: {
        title: 'Your library',
        description: 'Add your own folder of markdown chapters, or edit what’s here. Everything stays on your device.'
      }
    }
  ].filter(s => document.querySelector(s.element));

  if (!steps.length) return;

  driver({
    showProgress: true,
    animate: true,
    overlayOpacity: 0.72,
    stagePadding: 6,
    stageRadius: 12,
    popoverClass: 'nr-tour',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Start reading',
    steps,
    onDestroyed: () => localStorage.setItem(SEEN, '1')
  }).drive();
}
