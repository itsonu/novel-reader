'use client';
import { useEffect } from 'react';

// Registers the service worker and asks for persistent storage once a library exists.
// ponytail: no update-toast UI — the SW is network-first on pages, so a reload picks
// up a redeploy on its own. Add a prompt if users ever report stale content.
export default function PWA() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    // basePath-aware: a project Pages site is served from /<repo>/
    const base = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/';
    navigator.serviceWorker.register(`${base.replace(/\/+$/, '')}/sw.js`, { scope: base })
      .catch(() => { /* offline support is optional; never break the page over it */ });
  }, []);
  return null;
}
