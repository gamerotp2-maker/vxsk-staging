'use strict';
/* VXSK V12.9.2 P1 — Account navigation only. Existing authentication and RPCs remain untouched. */
(() => {
  const doc = document;
  const $ = id => doc.getElementById(id);
  const profile = $('auth-panel-profile');
  const dialog = $('account-dialog');
  const welcome = profile?.querySelector('.account-welcome');
  const applications = profile?.querySelector('.account-dashboard-grid');
  const settings = profile?.querySelector('.account-settings-grid');
  const actions = $('account-logout')?.closest('.profile-buttons');
  if (!profile || !dialog || !welcome || !applications || !settings || !actions || $('vxsk-account-hub')) return;

  const make = (tag, cls, content) => {
    const item = doc.createElement(tag);
    if (cls) item.className = cls;
    if (content !== undefined) item.textContent = content;
    return item;
  };

  const hub = make('section', 'vxsk-account-hub');
  hub.id = 'vxsk-account-hub';
  hub.setAttribute('aria-label', 'My VXSK account hub');
  const eyebrow = make('p', 'vxsk-ah-eyebrow', 'MY ACCOUNT / COMMAND CENTER');
  const heading = make('div', 'vxsk-ah-heading');
  const title = make('h3', '', 'Your VXSK dashboard');
  const subtitle = make('p', '', 'Everything you already use, organized in one place.');
  heading.append(title, subtitle);
  const nav = make('div', 'vxsk-ah-tabs');
  nav.setAttribute('role','tablist');
  nav.setAttribute('aria-label','My account sections');
  const pages = make('div', 'vxsk-ah-pages');
  const sections = new Map();
  const tabs = new Map();
  const menu = [
    {id:'overview',label:'Overview',icon:'⌂'},
    {id:'activity',label:'My Arena',icon:'⚔'},
    {id:'settings',label:'Settings & Security',icon:'⚙'}
  ];
  for (const item of menu) {
    const button = make('button','vxsk-ah-tab', `${item.icon}  ${item.label}`);
    button.type = 'button';
    button.id = `vxsk-ah-tab-${item.id}`;
    button.setAttribute('role','tab');
    button.setAttribute('aria-controls',`vxsk-ah-page-${item.id}`);
    button.setAttribute('aria-selected','false');
    button.tabIndex=-1;
    const page = make('section','vxsk-ah-page');
    page.id = `vxsk-ah-page-${item.id}`;
    page.setAttribute('role','tabpanel');
    page.setAttribute('aria-labelledby',button.id);
    page.hidden=true;
    nav.append(button); pages.append(page);
    tabs.set(item.id,button);sections.set(item.id,page);
  }
  const navTo = (id, scroll = true) => {
    if (!tabs.has(id)) return;
    for (const [key, tab] of tabs) {
      const active = key===id;
      tab.setAttribute('aria-selected',String(active));
      tab.tabIndex=active?0:-1;
      sections.get(key).hidden=!active;
    }
    if(scroll)hub.scrollIntoView({block:'start',behavior:'instant'});
  };
  for(const [key,button] of tabs){
    button.addEventListener('click',()=>navTo(key));
    button.addEventListener('keydown',event=>{
      if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
      event.preventDefault();
      const ids=[...tabs.keys()];
      const current=ids.indexOf(key);
      const next=event.key==='Home'?0:event.key==='End'?ids.length-1:
        (current+(event.key==='ArrowRight'?1:-1)+ids.length)%ids.length;
      tabs.get(ids[next]).focus();navTo(ids[next]);
    });
  }

  const destination = {
    applications: {tab:'activity', target:'my-applications-title'},
    opponents: {tab:'activity', target:'my-opponents-title'},
    settings: {tab:'settings', target:'account-nickname'},
    security: {tab:'settings', target:'mfa-badge'},
    friends: {external:'community', target:'community-friends'},
    challenges: {external:'community', target:'vxsk-challenges'},
    squads: {external:'community', target:'vxsk-groups'},
    blocklist: {external:'community', target:'community-blocklist'}
  };
  function navigate(where){
    const to=destination[where];
    if(!to)return;
    if(to.external){
      // Native dialog must be closed before scrolling to the page beneath it.
      if(dialog.open)dialog.close();
    }else{navTo(to.tab);}
    // Render the selected account panel before scrolling (and allow the modal to close).
    requestAnimationFrame(()=>{
      const target=$(to.target)||$(to.external);
      target?.scrollIntoView({behavior:'smooth',block:'center'});
    });
  }

  const home = sections.get('overview');
  const greeting = make('p','vxsk-ah-intro','Choose what you want to manage. Your existing player data and privacy settings stay unchanged.');
  const tiles = make('div','vxsk-ah-shortcuts');
  const shortcuts = [
    ['applications','📋','My applications','Check registration decisions and updates'],
    ['opponents','🎯','No Opponent','Track requests to find a rival'],
    ['friends','👥','Friends & requests','Find players and manage friendships'],
    ['challenges','⚔','My challenges','Review your showmatch invitations'],
    ['squads','🎧','Squad chats','Open your accepted private groups'],
    ['blocklist','🛡','My blocklist','Review players you blocked'],
    ['settings','⚙','Profile settings','Nickname, avatar, account options'],
    ['security','🔐','Security & 2FA','Check your account protection']
  ];
  for(const [target, symbol, name, description] of shortcuts){
    if((target==='squads'&&!$('vxsk-groups')) || (target==='challenges'&&!$('vxsk-challenges')))continue;
    const button=make('button','vxsk-ah-shortcut');
    button.type='button';
    const emoji=make('span','vxsk-ah-shortcut-icon',symbol);
    emoji.setAttribute('aria-hidden','true');
    const copy=make('span','vxsk-ah-shortcut-copy');
    copy.append(make('strong','',name),make('small','',description));
    const arrow=make('span','vxsk-ah-shortcut-arrow','↗');
    arrow.setAttribute('aria-hidden','true');
    button.append(emoji,copy,arrow);
    button.addEventListener('click',()=>navigate(target));
    tiles.append(button);
  }
  const hint = make('p','vxsk-ah-note','Privacy: your private account information is not displayed on the public player directory.');
  home.append(greeting,tiles,hint);

  const arena = sections.get('activity');
  const arenaIntro=make('div','vxsk-ah-section-intro');
  arenaIntro.append(make('h4','', 'My Arena'),make('p','', 'Your saved registration and No Opponent statuses appear below. Use Refresh for the latest results.'));
  arena.append(arenaIntro,applications);

  const prefs = sections.get('settings');
  const prefsIntro=make('div','vxsk-ah-section-intro');
  prefsIntro.append(make('h4','', 'Account settings & security'),make('p','', 'Update your profile, manage sign-in, or review two-step verification.'));
  prefs.append(prefsIntro,settings,actions);
  // Keep the ORIGINAL authorization-controlled Staff links discoverable on Overview.
  // Moving an existing element preserves its ID, hidden flag and Supabase-driven state.
  const staffLinks = [actions.querySelector('#account-staff-link'), actions.querySelector('#account-owner-roles')].filter(Boolean);
  if (staffLinks.length) {
    const staffArea = make('div','vxsk-ah-staff-actions');
    for (const link of staffLinks) staffArea.append(link);
    home.append(staffArea);
  }
  // Existing avatar buttons open the file picker immediately. Reveal Settings first,
  // so the upload, crop preview and Save controls are visible when a photo is chosen.
  doc.querySelectorAll('.vxsk-avatar-edit-button').forEach(button => {
    button.addEventListener('click', () => navTo('settings',false), true);
  });

  // Preserve original markup, element IDs, and event listeners by moving—not cloning—the nodes.
  // Welcome stays in its original place so auth-client.js can continue updating it.
  welcome.insertAdjacentElement('afterend',hub);
  hub.append(eyebrow,heading,nav,pages);
  navTo('overview',false);
  // Reset tab after signing out or closing, but do not block the existing account lifecycle.
  dialog.addEventListener('close',()=>navTo('overview',false));
  // Tab nav never changes Supabase privileges, application submission or permissions.
})();
