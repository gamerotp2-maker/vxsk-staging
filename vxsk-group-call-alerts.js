'use strict';
/* VXSK V12.9.3-P3: Active squad-call alerts, using existing member-scoped RPCs.
   No new database access, no media capture without an explicit Join click.
   This is polling while VXSK is open, NOT server push or an incoming invite. */
(() => {
  const doc = document;
  const $ = id => doc.getElementById(id);
  const bell = $('vxsk-notification-bell');
  const notificationPanel = $('vxsk-notification-panel');
  if (!bell || !notificationPanel || $('vxsk-group-call-alert')) return;

  const RING_KEY = 'vxsk-group-ring-v12.9.3-p3';
  const POLL_MS = 20000;
  const MAX_GROUPS = 20;
  const isUuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
  const create = (tag, cls, label) => {
    const el = doc.createElement(tag);
    if (cls) el.className = cls;
    if (label !== undefined) el.textContent = label;
    return el;
  };
  const makeButton = (label, cls = '') => {
    const btn = create('button', cls, label);
    btn.type = 'button';
    return btn;
  };

  const indicator = create('span', 'vxsk-group-call-dot', '📞');
  indicator.setAttribute('aria-hidden', 'true');
  indicator.hidden = true;
  bell.append(indicator);

  const notice = create('section', 'vxsk-group-call-alert');
  notice.id = 'vxsk-group-call-alert';
  notice.hidden = true;
  notice.setAttribute('role', 'region');
  notice.setAttribute('aria-label', 'Active squad call');
  const header = create('div', 'vxsk-group-call-alert-head');
  const title = create('strong', '', 'SQUAD CALL ACTIVE');
  const subtitle = create('small', '', 'An accepted group has an active call.');
  const label = create('div', 'vxsk-group-call-alert-copy');
  label.append(title, subtitle);
  const ignore = makeButton('×', 'vxsk-group-call-alert-dismiss');
  ignore.setAttribute('aria-label', 'Ignore this call alert');
  header.append(label, ignore);
  const actions = create('div', 'vxsk-group-call-alert-actions');
  const audio = makeButton('🎧 JOIN AUDIO', 'vxsk-group-call-alert-join');
  const video = makeButton('📹 JOIN VIDEO', 'vxsk-group-call-alert-join');
  const ring = makeButton('🔕 ENABLE RING', 'vxsk-group-call-alert-ring');
  ring.setAttribute('aria-pressed', 'false');
  actions.append(audio, video, ring);
  const info = create('p', 'vxsk-group-call-alert-info',
    'Joining requires your approval. Camera and microphone are never enabled by this alert.');
  notice.append(header, actions, info);
  doc.body.append(notice);

  const panelItem = create('div', 'vxsk-group-call-panel-item');
  panelItem.hidden = true;
  const panelHeading = create('strong', '', '📞 ACTIVE SQUAD CALLS');
  const panelText = create('p', '', '');
  const panelActions = create('div', 'vxsk-group-call-panel-actions');
  const panelJoin = makeButton('OPEN ACTIVE CALL', 'vxsk-group-call-panel-join');
  const panelMute = makeButton('ENABLE GROUP RING', 'vxsk-group-call-panel-ring');
  panelActions.append(panelJoin, panelMute);
  panelItem.append(panelHeading, panelText, panelActions);
  const panelFooter = notificationPanel.querySelector('.vxsk-notification-footer');
  if (panelFooter) panelFooter.before(panelItem);
  else notificationPanel.append(panelItem);

  // Audio can be blocked unless the user explicitly activates it in this tab.
  // Do not claim RING ON from saved settings if the current page has not unlocked playback.
  let ringEnabled = false;
  const ringtone = new Audio('assets/vxsk-incoming-ring-custom.mp3');
  ringtone.preload = 'auto';
  ringtone.loop = true;
  ringtone.volume = 0.7;
  let ringTimeout = null;
  let active = [];
  let seen = new Set();
  let ignored = new Set();
  let uid = null;
  let busy = false;
  let generation = 0;
  let ringingGroup = null;

  const headerNav = doc.querySelector('.nav.shell') || doc.querySelector('.nav');
  const squadLink = create('a', 'vxsk-squad-header', '💬 SQUADS');
  squadLink.id = 'vxsk-squad-header';
  squadLink.href = '#vxsk-groups';
  squadLink.title = 'Open My Account → Squad Chats';
  squadLink.setAttribute('aria-label', 'Open private squad chats in My Account');
  const joinHeader = makeButton('● JOIN', 'vxsk-squad-live-join');
  joinHeader.id = 'vxsk-squad-live-join';
  joinHeader.hidden = true;
  joinHeader.title = 'Join active squad audio call';
  const ringHeader = makeButton('🔕 RING OFF', 'vxsk-squad-ring-toggle');
  ringHeader.id = 'vxsk-squad-ring-toggle';
  ringHeader.setAttribute('aria-label', 'Enable group ringtone and play a test sound');
  ringHeader.setAttribute('aria-pressed', 'false');
  const headerCluster = create('div', 'vxsk-squad-header-cluster');
  headerCluster.append(squadLink, joinHeader, ringHeader);
  if (headerNav) {
    const bellParent = bell.closest('.vxsk-community-nav');
    if (bellParent) bellParent.insertAdjacentElement('afterend', headerCluster);
    else headerNav.append(headerCluster);
  }
  function stopRing() {
    if (ringTimeout) { clearTimeout(ringTimeout); ringTimeout = null; }
    ringtone.pause();
    try { ringtone.currentTime = 0; } catch (_) {}
    ringingGroup = null;
  }
  function updateRingUi() {
    ring.textContent = ringEnabled ? '🔔 RING ON' : '🔕 ENABLE RING';
    ring.setAttribute('aria-pressed', String(ringEnabled));
    panelMute.textContent = ringEnabled ? 'MUTE GROUP RING' : 'ENABLE GROUP RING';
    ringHeader.textContent = ringEnabled ? '🔔 RING ON' : '🔕 RING OFF';
    ringHeader.setAttribute('aria-pressed', String(ringEnabled));
    ringHeader.setAttribute('aria-label', ringEnabled ? 'Disable group ringtone' : 'Enable group ringtone and play a test sound');
    if (!ringEnabled) stopRing();
  }
  updateRingUi();
  async function setRing() {
    if (ringEnabled) {
      ringEnabled = false;
      try { localStorage.setItem(RING_KEY, 'off'); } catch (_) {}
      updateRingUi();
      info.textContent = 'Group ringtone muted for this tab.';
      return;
    }
    // The first audible playback happens inside the user click, not from a timer.
    // If browser autoplay/site sound is blocked, keep the toggle OFF.
    try {
      ringtone.volume = 0.7;
      ringtone.loop = false;
      ringtone.currentTime = 0;
      await ringtone.play();
      ringEnabled = true;
      try { localStorage.setItem(RING_KEY, 'on'); } catch (_) {}
      updateRingUi();
      info.textContent = 'If you heard the test ring, incoming squad calls can ring while this tab is open. Your browser may still restrict background audio.';
      // Brief audible confirmation; do not leave the test ringing indefinitely.
      if (ringTimeout) clearTimeout(ringTimeout);
      ringTimeout = setTimeout(() => {
        stopRing();
        ringtone.loop = true;
      }, 1200);
    } catch (_) {
      ringEnabled = false;
      ringtone.loop = true;
      updateRingUi();
      info.textContent = 'Browser blocked the ringtone or the audio asset failed. Allow sound for this site, then tap RING OFF again.';
    }
  }
  ring.addEventListener('click', () => { void setRing(); });
  panelMute.addEventListener('click', () => { void setRing(); });
  ringHeader.addEventListener('click', () => { void setRing(); });

  async function playRing(groupId) {
    if (!ringEnabled || doc.hidden || ringingGroup === groupId ||
        window.VXSKGroupCalls?.isActive?.() || window.VXSKCalls?.isActive?.()) return;
    stopRing();
    ringingGroup = groupId;
    ringtone.loop = true;
    try { await ringtone.play(); }
    catch (_) {
      info.textContent = 'Squad call detected but audio playback was blocked. Tap RING OFF to test and re-enable sound.';
      ringEnabled = false; updateRingUi(); stopRing(); return;
    }
    ringTimeout = setTimeout(stopRing, 16000);
  }

  function display() {
    const currentCalls = window.VXSKGroupCalls?.isActive?.() || window.VXSKCalls?.isActive?.();
    const visible = currentCalls ? [] : active.filter(x => !ignored.has(x.id));
    const current = visible[0];
    indicator.hidden = active.length === 0;
    joinHeader.hidden = active.length === 0 || Boolean(currentCalls);
    joinHeader.classList.toggle('is-live', !joinHeader.hidden);
    joinHeader.setAttribute('aria-label', active.length ? `Join active squad call in ${active[0].name}` : 'No active squad calls');
    squadLink.classList.toggle('has-live-call', active.length > 0);
    bell.classList.toggle('vxsk-has-group-call', active.length > 0);
    panelItem.hidden = active.length === 0;
    panelText.textContent = active.length === 1
      ? `${active[0].name} · ${active[0].count} participant${active[0].count === 1 ? '' : 's'} in call`
      : `${active.length} squad calls are currently active`;
    notice.hidden = !current;
    if (current) {
      title.textContent = `${current.name.toUpperCase()} · CALL ACTIVE`;
      subtitle.textContent = `${current.count} in call · join only when ready`;
    }
    if (!current || ringingGroup !== current.id) stopRing();
  }
  function join(group, medium) {
    if (!group || !window.VXSKGroupCalls?.start) return;
    stopRing();
    ignored.add(group.id);
    display();
    // Existing group-calls.js checks server permissions and requests media on Join.
    void window.VXSKGroupCalls.start(group.id, medium, group.name);
  }
  audio.addEventListener('click', () => join(active.find(x => !ignored.has(x.id)), 'audio'));
  video.addEventListener('click', () => join(active.find(x => !ignored.has(x.id)), 'video'));
  panelJoin.addEventListener('click', () => join(active[0], 'audio'));
  joinHeader.addEventListener('click', () => join(active[0], 'audio'));
  ignore.addEventListener('click', () => {
    const current = active.find(x => !ignored.has(x.id));
    if (current) ignored.add(current.id);
    stopRing(); display();
  });

  async function runPoll() {
    if (busy || doc.hidden) return;
    const api = window.VXSKAuth?.client;
    if (!api) return;
    busy = true;
    const token = generation;
    try {
      const { data, error } = await api.auth.getUser();
      if (error) throw error;
      const newUid = data?.user?.id || null;
      if (newUid !== uid) {
        uid = newUid; seen = new Set(); ignored = new Set();
        active = []; stopRing(); display();
      }
      if (!uid) return;
      const { data: groups, error: groupError } = await api.rpc('vxsk_group_list');
      if (groupError || !Array.isArray(groups)) return;
      const valid = groups.filter(g => g?.status === 'active' && isUuid(g.id)).slice(0, MAX_GROUPS);
      const found = [];
      // Bounded batches; use existing authenticated server-side membership checks.
      for (let i = 0; i < valid.length; i += 4) {
        const batch = await Promise.all(valid.slice(i, i + 4).map(async group => {
          try {
            const result = await api.rpc('vxsk_group_call_roster', { p_group: group.id });
            const roster = result.error ? null : result.data;
            if (!Array.isArray(roster) || !roster.some(member => member?.user_id !== uid)) return null;
            return { id: group.id, name: String(group.name || 'SQUAD').slice(0, 40), count: roster.length };
          } catch (_) { return null; }
        }));
        found.push(...batch.filter(Boolean));
      }
      if (token !== generation || newUid !== uid) return;
      const nowActive = new Set(found.map(x => x.id));
      const newCalls = found.filter(x => !seen.has(x.id));
      for (const id of [...ignored]) if (!nowActive.has(id)) ignored.delete(id);
      active = found;
      seen = nowActive;
      display();
      const fresh = newCalls.find(x => !ignored.has(x.id));
      if (fresh) { void playRing(fresh.id); }
    } catch (_) {
      // Fail closed: no invented alerts. A temporary network error must not erase the baseline.
    } finally { busy = false; }
  }
  function clearForAuth() {
    generation++;
    uid = null; seen = new Set(); ignored = new Set();
    active = []; stopRing(); display();
    setTimeout(() => { void runPoll(); }, 250);
  }
  window.addEventListener('vxsk:auth-change', clearForAuth);
  window.addEventListener('vxsk:auth-updated', () => { void runPoll(); });
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) stopRing();
    else { void runPoll(); }
  });
  window.addEventListener('pagehide', stopRing);
  setInterval(() => { void runPoll(); }, POLL_MS);
  setTimeout(() => { void runPoll(); }, 2200);
})();
