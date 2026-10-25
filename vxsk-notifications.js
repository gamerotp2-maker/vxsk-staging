'use strict';
/* VXSK V12.9.3 P1 — read-only social notification UI.
   Reuses the authenticated friend-request / unread-DM counts already rendered by
   community.js. Does not request, store, mark read, or invent notifications. */
(() => {
  const doc = document;
  const $ = id => doc.getElementById(id);
  const friends = $('nav-friends-toggle');
  const existingCount = $('nav-friend-count');
  if (!friends || !existingCount || $('vxsk-notification-bell')) return;

  const make = (tag, cls, label) => {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (label !== undefined) node.textContent = label;
    return node;
  };
  const bell = make('button', 'vxsk-notification-bell');
  bell.id = 'vxsk-notification-bell';
  bell.type = 'button';
  bell.setAttribute('aria-haspopup', 'dialog');
  bell.setAttribute('aria-expanded', 'false');
  bell.setAttribute('aria-controls', 'vxsk-notification-panel');
  bell.setAttribute('aria-label', 'Open notifications');
  bell.title = 'Notifications';
  const symbol = make('span', 'vxsk-notification-symbol', '🔔');
  symbol.setAttribute('aria-hidden', 'true');
  const count = make('span', 'vxsk-notification-count');
  count.hidden = true;
  count.setAttribute('aria-hidden', 'true');
  bell.append(symbol, count);
  friends.insertAdjacentElement('afterend', bell);
  // Some VXSK mobile layouts collapse the whole friends navbar. Keep the bell
  // independently reachable instead of leaving it inside a display:none parent.
  function placeBell() {
    const navVisible = friends.getClientRects().length > 0;
    if (!navVisible) {
      if (bell.parentElement !== doc.body) doc.body.append(bell);
      bell.classList.add('is-floating');
    } else {
      if (bell.previousElementSibling !== friends) friends.insertAdjacentElement('afterend', bell);
      bell.classList.remove('is-floating');
    }
  }
  placeBell();
  window.addEventListener('resize', placeBell, { passive: true });
  window.addEventListener('load', placeBell, { once: true });

  const panel = make('section', 'vxsk-notification-panel');
  panel.id = 'vxsk-notification-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'VXSK notifications');
  panel.setAttribute('aria-modal', 'false');
  panel.hidden = true;
  const header = make('div', 'vxsk-notification-heading');
  const headingCopy = make('div', 'vxsk-notification-heading-copy');
  headingCopy.append(make('strong', '', 'NOTIFICATIONS'), make('small', '', 'Social activity · live counts'));
  const close = make('button', 'vxsk-notification-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close notifications');
  header.append(headingCopy, close);
  const subtitle = make('p', 'vxsk-notification-intro', 'Friend requests and unread private messages from your VXSK account.');
  const summary = make('p', 'vxsk-notification-summary');
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');

  function item(icon, title, destination) {
    const link = make('a', 'vxsk-notification-item');
    link.href = destination;
    const mark = make('span', 'vxsk-notification-item-icon', icon);
    mark.setAttribute('aria-hidden', 'true');
    const content = make('span', 'vxsk-notification-item-copy');
    const label = make('strong', '', title);
    const value = make('small', '', 'No new activity');
    content.append(label, value);
    const arrow = make('span', 'vxsk-notification-item-arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(mark, content, arrow);
    return { link, value };
  }
  const requests = item('👥', 'FRIEND REQUESTS', '#community-friends');
  const dms = item('💬', 'UNREAD MESSAGES', '#community-chat');
  const footer = make('div', 'vxsk-notification-footer');
  const refresh = make('button', 'vxsk-notification-refresh', '↻ REFRESH');
  refresh.type = 'button';
  const manage = make('a', 'vxsk-notification-manage', 'OPEN MY ACCOUNT ↗');
  manage.href = '#community-friends';
  footer.append(refresh, manage);
  const note = make('p', 'vxsk-notification-note', 'Messages are marked read only when opened in the original chat. Sounds follow your browser’s playback rules.');
  panel.append(header, subtitle, summary, requests.link, dms.link, footer, note);
  doc.body.append(panel);

  const readState = () => {
    // community.js sets the exact counts in this title after its authorized RPC.
    const title = friends.getAttribute('title') || '';
    const requestMatch = title.match(/(\d+)\s+requests?\b/i);
    const unreadMatch = title.match(/(\d+)\s+unread\s+DMs?\b/i);
    const requests = requestMatch ? Number(requestMatch[1]) : 0;
    const unread = unreadMatch ? Number(unreadMatch[1]) : 0;
    const rawBadge = existingCount.hidden ? '' : (existingCount.textContent || '').trim();
    const shownCount = Number.parseInt(rawBadge, 10);
    const total = requests + unread || (Number.isFinite(shownCount) ? shownCount : 0);
    return { requests, unread, total, known: !!(requestMatch || unreadMatch), capped: rawBadge.includes('+') };
  };

  let initialized = false;
  let previousTotal = 0;
  function render() {
    const state = readState();
    const active = state.total > 0;
    count.hidden = !active;
    count.textContent = state.capped || state.total > 99 ? '99+' : String(state.total);
    bell.classList.toggle('has-alert', active);
    bell.setAttribute('aria-label', active ? `Open notifications, ${state.total}${state.capped ? ' or more' : ''} unread alerts` : 'Open notifications, none unread');
    bell.title = active ? `${state.total}${state.capped ? '+' : ''} social alerts` : 'Notifications';
    if (initialized && state.total > previousTotal && !doc.hidden) {
      bell.classList.remove('vxsk-notification-pulse');
      // Restart CSS attention state without setting timers or playing duplicate sounds.
      void bell.offsetWidth;
      bell.classList.add('vxsk-notification-pulse');
    }
    initialized = true;
    previousTotal = state.total;
    if (!state.known && active) {
      summary.textContent = `${state.total}${state.capped ? '+' : ''} unread social alerts`;
      requests.value.textContent = 'Open Friends to see requests';
      dms.value.textContent = 'Open private chat to see messages';
    } else {
      summary.textContent = active ? `${state.total} notification${state.total === 1 ? '' : 's'} to check` : 'You are all caught up.';
      requests.value.textContent = state.requests ? `${state.requests} pending request${state.requests === 1 ? '' : 's'}` : 'No new friend requests';
      dms.value.textContent = state.unread ? `${state.unread} unread message${state.unread === 1 ? '' : 's'}` : 'No unread messages';
    }
  }
  function show(open, restore = false) {
    panel.hidden = !open;
    bell.setAttribute('aria-expanded', String(open));
    if (open) close.focus();
    else if (restore) bell.focus();
  }
  bell.addEventListener('click', () => show(panel.hidden));
  close.addEventListener('click', () => show(false, true));
  panel.addEventListener('click', event => {
    if (event.target.closest('a[href^="#community"]')) show(false);
  });
  doc.addEventListener('click', event => {
    if (panel.hidden || panel.contains(event.target) || bell.contains(event.target)) return;
    show(false);
  });
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { event.stopPropagation(); show(false, true); }
  });
  const accountDialog = $('account-dialog');
  if (accountDialog && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => { if (accountDialog.open && !panel.hidden) show(false); })
      .observe(accountDialog, { attributes: true, attributeFilter: ['open'] });
  }
  refresh.addEventListener('click', () => {
    const existing = $('nav-friends-refresh');
    if (existing) existing.click();
  });
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(render);
    observer.observe(friends, { attributes: true, attributeFilter: ['title', 'aria-label'] });
    observer.observe(existingCount, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
  }
  render();
})();
