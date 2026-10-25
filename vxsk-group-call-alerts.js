'use strict';
/* VXSK V12.9.3-P2: Active squad-call alerts, using existing member-scoped RPCs.
   No new database access, no media capture without an explicit Join click.
   This is polling while VXSK is open, NOT server push or an incoming invite. */
(() => {
  const doc = document;
  const $ = id => doc.getElementById(id);
  const bell = $('vxsk-notification-bell');
  const notificationPanel = $('vxsk-notification-panel');
  if (!bell || !notificationPanel || $('vxsk-group-call-alert')) return;

  const RING_KEY = 'vxsk-group-ring-v12.9.3-p2';
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

  let ringEnabled = false;
  try { ringEnabled = localStorage.getItem(RING_KEY) === 'on'; } catch (_) {}
  const ringtone = new Audio('assets/vxsk-incoming-ring-custom.mp3');
  ringtone.preload = 'none';
  ringtone.loop = true;
  ringtone.volume = 0.7;
  let ringTimeout = null;
  let active = [];
  let seen = new Set();
  let ignored = new Set();
  let baseline = false;
  let uid = null;
  let busy = false;
  let generation = 0;
  let ringingGroup = null;

  function stopRing() {
    if (ringTimeout) { clearTimeout(ringTimeout); ringTimeout = null; }
    ringtone.pause();
    ringtone.currentTime = 0;
    ringingGroup = null;
  }
  function updateRingUi() {
    ring.textContent = ringEnabled ? '🔔 RING ON' : '🔕 ENABLE RING';
    ring.setAttribute('aria-pressed', String(ringEnabled));
    panelMute.textContent = ringEnabled ? 'MUTE GROUP RING' : 'ENABLE GROUP RING';
    if (!ringEnabled) stopRing();
  }
  updateRingUi();
  async function setRing() {
    ringEnabled = !ringEnabled;
    try { localStorage.setItem(RING_KEY, ringEnabled ? 'on' : 'off'); } catch (_) {}
    // Only direct user gestures enable the ringtone. Browser policy can still block audio.
    if (ringEnabled) {
      try {
        const old = ringtone.volume;
        ringtone.volume = 0;
        await ringtone.play();
        ringtone.pause(); ringtone.currentTime = 0;
        ringtone.volume = old;
        info.textContent = 'Ring enabled for active squad calls while VXSK is open.';
      } catch (_) {
        ringtone.volume = 0.7;
        info.textContent = 'Ring enabled, but browser blocked sound. Allow audio for VXSK.';
      }
    }
    updateRingUi();
  }
  ring.addEventListener('click', () => { void setRing(); });
  panelMute.addEventListener('click', () => { void setRing(); });

  async function playRing(groupId) {
    if (!ringEnabled || doc.hidden || ringingGroup === groupId ||
        window.VXSKGroupCalls?.isActive?.() || window.VXSKCalls?.isActive?.()) return;
    stopRing();
    ringingGroup = groupId;
    try { await ringtone.play(); }
    catch (_) { info.textContent = 'A squad call is active. Click ENABLE RING or allow site sound.'; stopRing(); return; }
    ringTimeout = setTimeout(stopRing, 16000);
  }

  function display() {
    const currentCalls = window.VXSKGroupCalls?.isActive?.() || window.VXSKCalls?.isActive?.();
    const visible = currentCalls ? [] : active.filter(x => !ignored.has(x.id));
    const current = visible[0];
    indicator.hidden = active.length === 0;
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
        uid = newUid; baseline = false; seen = new Set(); ignored = new Set();
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
      const newCalls = baseline ? found.filter(x => !seen.has(x.id)) : [];
      for (const id of [...ignored]) if (!nowActive.has(id)) ignored.delete(id);
      active = found;
      seen = nowActive;
      baseline = true;
      display();
      const fresh = newCalls.find(x => !ignored.has(x.id));
      if (fresh) { void playRing(fresh.id); }
    } catch (_) {
      // Fail closed: no invented alerts. A temporary network error must not erase the baseline.
    } finally { busy = false; }
  }
  function clearForAuth() {
    generation++;
    uid = null; baseline = false; seen = new Set(); ignored = new Set();
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
