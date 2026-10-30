const paths = {
  logo: `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="orbitLogoGrad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity=".52"/>
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="5.2" stroke="url(#orbitLogoGrad)" stroke-width="2.4"/>
    <ellipse cx="16" cy="16" rx="12.5" ry="6.4" transform="rotate(-28 16 16)" stroke="url(#orbitLogoGrad)" stroke-width="1.7"/>
    <circle cx="26" cy="10.2" r="2.2" fill="currentColor"/>
  </svg>`,
  files: `<svg viewBox="0 0 24 24" fill="none"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  cpu: `<svg viewBox="0 0 24 24" fill="none"><rect x="6.5" y="6.5" width="11" height="11" rx="2.2" stroke="currentColor" stroke-width="1.6"/><path d="M9.8 9.8h4.4v4.4H9.8zM9 2.8v3.7M15 2.8v3.7M9 17.5v3.7M15 17.5v3.7M2.8 9h3.7M2.8 15h3.7M17.5 9h3.7M17.5 15h3.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.2c.6 4.2 2.6 6.2 6.8 6.8-4.2.6-6.2 2.6-6.8 6.8-.6-4.2-2.6-6.2-6.8-6.8 4.2-.6 6.2-2.6 6.8-6.8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M18.4 15.2c.25 1.65 1.05 2.45 2.7 2.7-1.65.25-2.45 1.05-2.7 2.7-.25-1.65-1.05-2.45-2.7-2.7 1.65-.25 2.45-1.05 2.7-2.7ZM5.7 2.8c.16 1.1.7 1.64 1.8 1.8-1.1.16-1.64.7-1.8 1.8-.16-1.1-.7-1.64-1.8-1.8 1.1-.16 1.64-.7 1.8-1.8Z" fill="currentColor"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke="currentColor" stroke-width="1.6"/><path d="M19.3 13.2a7.6 7.6 0 0 0 0-2.4l2-1.5-2-3.4-2.3.9a7.8 7.8 0 0 0-2.1-1.2L14.6 3h-4l-.4 2.6a7.8 7.8 0 0 0-2.1 1.2l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7.8 7.8 0 0 0 2.1 1.2l.4 2.6h4l.4-2.6a7.8 7.8 0 0 0 2.1-1.2l2.3.9 2-3.4-2-1.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  help: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M9.7 9.2a2.4 2.4 0 0 1 4.7.5c0 1.6-2.4 1.9-2.4 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="16.9" r="1" fill="currentColor"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none"><path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.4c.6 0 1.2.3 1.6.8l1 1.2H18a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  'folder-open': `<svg viewBox="0 0 24 24" fill="none"><path d="M3.8 8V7a2 2 0 0 1 2-2h3.3c.5 0 1 .2 1.4.6l1.2 1.1H18a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4.2 10.2h16l-2 7.2a2 2 0 0 1-1.9 1.4H5.6a2 2 0 0 1-2-2.2l.6-6.4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  'folder-plus': `<svg viewBox="0 0 24 24" fill="none"><path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.4c.6 0 1.2.3 1.6.8l1 1.2H18a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10.5v5M9.5 13h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none"><path d="M20 11a8 8 0 0 0-14.9-4M4 5v4h4M4 13a8 8 0 0 0 14.9 4M20 19v-4h-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none"><path d="m6.5 6.5 11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  minimize: `<svg viewBox="0 0 24 24" fill="none"><path d="M6 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  maximize: `<svg viewBox="0 0 24 24" fill="none"><rect x="5.5" y="5.5" width="13" height="13" rx="1.5" stroke="currentColor" stroke-width="1.5"/></svg>`,
  restore: `<svg viewBox="0 0 24 24" fill="none"><rect x="4.5" y="7.5" width="11" height="11" rx="1.3" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.5V5.3c0-.5.4-.8.8-.8h9.9c.5 0 .8.3.8.8v9.9c0 .4-.3.8-.8.8H16.5" stroke="currentColor" stroke-width="1.4"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none"><path d="M8.2 5.7v12.6c0 .7.8 1.1 1.4.7l9.2-6.3a.8.8 0 0 0 0-1.4L9.6 5c-.6-.4-1.4 0-1.4.7Z" fill="currentColor"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="none"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/></svg>`,
  hammer: `<svg viewBox="0 0 24 24" fill="none"><path d="m13.3 6.7 4 4M5 19l7.2-7.2M11 4l1.8 1.8-3 3L8 7g3-3Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="m12.8 7.2 4-4 4 4-4 4-4-4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none"><path d="M4.5 7h15M9 7V5.5c0-.8.6-1.5 1.4-1.5h3.2c.8 0 1.4.7 1.4 1.5V7M7 7l.8 12c0 .9.7 1.5 1.5 1.5h5.4c.8 0 1.5-.6 1.5-1.5L17 7M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none"><path d="m14.8 5.2 4 4M4.5 19.5l1-5L16 4a1.8 1.8 0 0 1 2.5 0l1.5 1.5a1.8 1.8 0 0 1 0 2.5L9.5 18.5l-5 1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none"><rect x="8.5" y="8.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.5"/></svg>`,
  external: `<svg viewBox="0 0 24 24" fill="none"><path d="M14 4h6v6M20 4l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none"><path d="m5 12.5 4.5 4.5L19 6.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none"><path d="M10.4 4.2 3.2 16.7A2 2 0 0 0 4.9 19h14.2a2 2 0 0 0 1.7-2.3L13.6 4.2a1.8 1.8 0 0 0-3.2 0Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 9v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="15.9" r="1" fill="currentColor"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="m9 9 6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1" fill="currentColor"/></svg>`,
  terminal: `<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="m7.5 9 3 3-3 3M13 15h3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  save: `<svg viewBox="0 0 24 24" fill="none"><path d="M5.5 3.8h10.2l3.5 3.5v12a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 3.8v5.5h7V3.8M8 20v-6h8v6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  wand: `<svg viewBox="0 0 24 24" fill="none"><path d="m4 20 10.5-10.5M13 4v2M18 8h2M19.5 3.5l-1 1M19.5 12.5l-1-1M11.5 5l1 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="m14 6 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  chevron_right: `<svg viewBox="0 0 24 24" fill="none"><path d="m9.5 6.5 5.5 5.5-5.5 5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  'chevron-right': `<svg viewBox="0 0 24 24" fill="none"><path d="m9.5 6.5 5.5 5.5-5.5 5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  'chevron-down': `<svg viewBox="0 0 24 24" fill="none"><path d="m6.5 9.5 5.5 5.5 5.5-5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  'chevron-up': `<svg viewBox="0 0 24 24" fill="none"><path d="m6.5 14.5 5.5-5.5 5.5 5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  collapse: `<svg viewBox="0 0 24 24" fill="none"><path d="m8 9 4-4 4 4M8 15l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  orbit: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.6"/><ellipse cx="12" cy="12" rx="9.2" ry="4.7" transform="rotate(-28 12 12)" stroke="currentColor" stroke-width="1.3"/><circle cx="19.2" cy="7.4" r="1.5" fill="currentColor"/></svg>`,
  code: `<svg viewBox="0 0 24 24" fill="none"><path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4l-3 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  command: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 8V6.2A2.2 2.2 0 1 0 6.2 9H18a2.2 2.2 0 1 0-2.8-2.8V9M9 16v1.8A2.2 2.2 0 1 1 6.2 15H18a2.2 2.2 0 1 1-2.8 2.8V15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none"><rect x="5.5" y="10" width="13" height="10" rx="2.3" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="15" r="1.3" fill="currentColor"/></svg>`,
  flask: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 3.5h6M10 3.5v5.2l-5.2 8.2A2 2 0 0 0 6.5 20h11a2 2 0 0 0 1.7-3.1L14 8.7V3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 15h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5 19 6v5.4c0 4.3-2.8 7.4-7 9.1-4.2-1.7-7-4.8-7-9.1V6l7-2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pointer: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 3.8 19 12l-6.4 1.5L9.8 20 5 3.8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none"><circle cx="10.8" cy="10.8" r="6.5" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="none"><path d="M13.5 3 5.8 13.2h5.4L10.5 21l7.7-10.2h-5.4L13.5 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  key: `<svg viewBox="0 0 24 24" fill="none"><circle cx="8" cy="15.5" r="4" stroke="currentColor" stroke-width="1.6"/><path d="m11 12.5 8-8M16 4l4 4M14.5 5.5l2 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none"><path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11.5 6.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.3-1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  panel: `<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 14h17" stroke="currentColor" stroke-width="1.6"/></svg>`,
  arrow_right: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  'arrow-right': `<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.5" r="3.7" stroke="currentColor" stroke-width="1.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
};

export function icon(name, className = '') {
  const svg = paths[name] || paths.file;
  return svg.replace('<svg ', `<svg class="ico ${className}" `);
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.dataset.iconReady) return;
    const name = el.dataset.icon;
    el.innerHTML = icon(name);
    el.dataset.iconReady = '1';
  });
}
