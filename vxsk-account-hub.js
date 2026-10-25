'use strict';
/* VXSK V12.9.2 P2 — Move original community UI into account tabs; no data/auth/RPC edits. */
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
    {id:'community',label:'Community & Friends',icon:'👥'},
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

  let openCommunityPane = null;
  const destination = {
    applications: {tab:'activity', target:'my-applications-title'},
    opponents: {tab:'activity', target:'my-opponents-title'},
    settings: {tab:'settings', target:'account-nickname'},
    security: {tab:'settings', target:'mfa-badge'},
    friends: {tab:'community', pane:'friends', target:'community-friends'},
    challenges: {tab:'community', pane:'challenges', target:'vxsk-challenges'},
    squads: {tab:'community', pane:'squads', target:'vxsk-groups'},
    blocklist: {tab:'community', pane:'blocklist', target:'community-blocklist'}
  };
  function navigate(where){
    const to=destination[where];
    if(!to)return;
    navTo(to.tab,false);
    if(to.pane) openCommunityPane?.(to.pane);
    requestAnimationFrame(()=>$(to.target)?.scrollIntoView({behavior:'smooth',block:'nearest'}));
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
  // The original homepage Community UI now belongs to My Account.
  // MOVE nodes, never clone: maintain the existing IDs, private data, listeners and RPC clients.
  const community = $('community');
  const shell = community?.querySelector('.community-shell');
  const columns = shell?.querySelector('.community-columns');
  const originalPanels = columns && [...columns.children];
  const expected = ['community-search','community-go','community-results','community-friends',
    'community-blocklist','vxsk-challenges','vxsk-groups','community-chat'];
  if (community && shell && originalPanels?.length === 2 && expected.every(key=>$(key))) {
    const parent = sections.get('community');
    parent.append(community);
    community.classList.add('vxsk-ah-community-mounted');
    const subnav = make('div','vxsk-ah-community-nav');
    subnav.setAttribute('role','tablist');
    subnav.setAttribute('aria-label','Community sections');
    const choices = [
      ['discover','Find Players'],['friends','Friends & Requests'],
      ['blocklist','Blocklist'],['challenges','Challenges'],['squads','Squad Chats']
    ];
    const panes = new Map();
    const buttons = new Map();
    for (const [key,label] of choices) {
      const button=make('button','vxsk-ah-community-tab',label);
      button.type='button';button.id='vxsk-ah-community-tab-'+key;
      button.setAttribute('role','tab');button.setAttribute('aria-controls','vxsk-ah-community-pane-'+key);
      button.setAttribute('aria-selected','false');button.tabIndex=-1;
      const pane=make('section','vxsk-ah-community-pane');
      pane.id='vxsk-ah-community-pane-'+key;
      pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',button.id);
      pane.hidden=true;
      subnav.append(button);panes.set(key,pane);buttons.set(key,button);
    }
    openCommunityPane=(key,scroll=false)=>{
      if(!panes.has(key))return;
      for (const [name,pane] of panes) {
        const active=name===key;
        pane.hidden=!active;
        const tab=buttons.get(name);
        tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
      }
      if(scroll) shell.scrollIntoView({block:'start',behavior:'smooth'});
    };
    for (const [name,button] of buttons) {
      button.addEventListener('click',()=>openCommunityPane(name,true));
      button.addEventListener('keydown',event=>{
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();
        const ids=[...buttons.keys()];const at=ids.indexOf(name);
        const next=event.key==='Home'?0:event.key==='End'?ids.length-1:
          (at+(event.key==='ArrowRight'?1:-1)+ids.length)%ids.length;
        buttons.get(ids[next]).focus();openCommunityPane(ids[next]);
      });
    }
    const take = (target,...nodes) => nodes.forEach(node=>{if(node) target.append(node);});
    const find = panes.get('discover');
    take(find,shell.querySelector('.community-intro'),shell.querySelector('.community-search-row'),
      $('community-feedback'),$('community-results'),originalPanels[0]);
    take(panes.get('friends'),originalPanels[1],$('community-chat'));
    take(panes.get('blocklist'),$('community-blocklist'));
    take(panes.get('challenges'),$('vxsk-challenges'));
    take(panes.get('squads'),$('vxsk-groups'));
    // Keep the original #community ancestor for existing community script selectors.
    shell.replaceChildren(subnav,...panes.values());
    // Original empty column container can be discarded; its children were MOVED above.
    columns.remove();
    openCommunityPane('discover');

    function openCommunity(key,focusSearch=false) {
      // Reuse the existing auth-controlled My Account opener; never bypass sign-in.
      if (!dialog.open || profile.hidden) {
        doc.querySelector('.account-nav.open-account')?.click();
      }
      if (dialog.open && !profile.hidden) {
        navTo('community',false);
        openCommunityPane(key);
        if (focusSearch) requestAnimationFrame(()=> $('community-search')?.focus());
      }
    }
    // Previous bookmarks, footer links, navbar shortcuts must still work.
    const hashToPane = {
      '#community':'discover','#community-search':'discover',
      '#community-friends':'friends','#community-chat':'friends',
      '#community-blocklist':'blocklist','#vxsk-challenges':'challenges',
      '#vxsk-groups':'squads'
    };
    doc.addEventListener('click',event=>{
      const anchor=event.target.closest?.('a[href^="#"]');
      if (!anchor) return;
      const href=anchor.getAttribute('href');
      if (!Object.prototype.hasOwnProperty.call(hashToPane,href)) return;
      event.preventDefault();
      openCommunity(hashToPane[href],href==='#community-search');
    },true);
    for (const id of ['nav-add-friend','nav-friends-add']) {
      $(id)?.addEventListener('click',()=>openCommunity('discover',true),true);
    }
    // Once an existing friends action reveals the chat, switch to the correct tab.
    const chat=$('community-chat');
    if(chat && typeof MutationObserver !== 'undefined'){
      new MutationObserver(()=>{
        if(!chat.hidden && dialog.open && !profile.hidden){
          navTo('community',false);openCommunityPane('friends');
        }
      }).observe(chat,{attributes:true,attributeFilter:['hidden']});
    }
    // Preserve open account on community tab when user hits a navigation shortcut.
    // Sign-out still resets the original My Account interface.
    dialog.addEventListener('close',()=>openCommunityPane('discover'));
  } else {
    console.warn('[VXSK My Account] Community migration skipped: original markup missing.');
  }
  // Reset tab after signing out or closing, but do not block the existing account lifecycle.
  dialog.addEventListener('close',()=>navTo('overview',false));
  // Tab nav never changes Supabase privileges, application submission or permissions.
})();
