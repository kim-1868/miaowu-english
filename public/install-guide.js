// Lightweight, opt-in mobile home-screen instructions. No user/account data changes.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const tip = $('homeInstallTip');
  const overlay = $('installGuide');
  if (!tip || !overlay) return;
  const dialog = overlay.querySelector('.install-guide-dialog');
  const tabs = Array.from(overlay.querySelectorAll('[data-install-tab]'));
  const panels = Array.from(overlay.querySelectorAll('[data-install-panel]'));
  const storageKey = 'miaowu.install-tip-dismissed.v1';
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true;
  const mobile = window.matchMedia?.('(max-width: 760px)')?.matches ?? false;
  let previousFocus = null;
  let previousOverflow = '';

  const wasDismissed = () => {
    try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
  };
  if (mobile && !standalone && !wasDismissed()) tip.hidden = false;

  function choose(device) {
    tabs.forEach(tab => {
      const active = tab.dataset.installTab === device;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach(panel => {
      panel.hidden = panel.dataset.installPanel !== device;
    });
  }
  function openGuide() {
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    choose('iphone');
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    dialog.focus();
  }
  function closeGuide() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.style.overflow = previousOverflow;
    if (previousFocus?.focus) previousFocus.focus();
  }
  $('installTipOpen')?.addEventListener('click', openGuide);
  $('installAccountOpen')?.addEventListener('click', openGuide);
  $('installGuideClose')?.addEventListener('click', closeGuide);
  $('installTipDismiss')?.addEventListener('click', () => {
    tip.hidden = true;
    try { localStorage.setItem(storageKey, '1'); } catch { /* storage is optional */ }
  });
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeGuide();
  });
  document.addEventListener('keydown', event => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') { closeGuide(); return; }
    if (event.key === 'Tab') {
      const focusables = Array.from(dialog.querySelectorAll('button:not([disabled]):not([tabindex="-1"])'))
        .filter(el => el.getClientRects().length > 0);
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => choose(tab.dataset.installTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      choose(next.dataset.installTab);
      next.focus();
    });
  });
})();
