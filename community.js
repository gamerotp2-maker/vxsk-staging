/* VXSK V12.8.36 — social panel polish over V12.8.35: icons, deduplicated presence, mini-panel Block. */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const search=$('community-search'), results=$('community-results'), info=$('community-feedback');
  if(!search||!results)return;
  const friendsEl=$('community-friends');
  const blockedEl=$('community-blocked-list'), blockedCount=$('community-blocked-count');
  const privacyControls=$('community-privacy-controls'),sharePresence=$('community-share-presence');
  const chat=$('community-chat'),chatTitle=$('community-chat-with'),messages=$('community-messages');
  let client=null,user=null, snapshot=null,peer=null,peerName='',lastTerm='',lastIdentity=null;
  // Multiple auth/focus/refresh events can overlap. Only the latest response may render.
  let friendsRefreshVersion=0;
  const navForm=$('nav-player-search-form'),navSearch=$('nav-player-search'),navFriendsToggle=$('nav-friends-toggle');
  const navFriendsPanel=$('nav-friends-panel'),navFriendsEntries=$('nav-friends-entries'),navFriendCount=$('nav-friend-count');
  // Load isolated style overrides so the updated social panel never overwrites
  // the visitor's existing cinematic-video CSS, call UI, or homepage markup.
  if(!document.querySelector('link[data-vxsk-social-polish]')){
    const theme=document.createElement('link');
    theme.rel='stylesheet';
    theme.href='vxsk-social-polish.css?v=12.8.36';
    theme.dataset.vxskSocialPolish='true';
    document.head.append(theme);
  }
  const signedAvatars=new Map();
  const avatarFallbacks=new Map();
  const trustedRemoteAvatar=url=>typeof url==='string' && /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net|images-ext-1\.discordapp\.net|lh3\.googleusercontent\.com|[a-z0-9.-]+\.googleusercontent\.com)\//i.test(url);
  async function lookupAvatarRefs(ids){
    if(!client||!user||!Array.isArray(ids)||!ids.length)return [];
    const args={p_ids:[...new Set(ids)].slice(0,20)};
    const {data,error}=await client.rpc('vxsk_social_avatar_lookup_v2',args);
    if(!error)return Array.isArray(data)?data:[];
    const fallback=await client.rpc('vxsk_social_avatar_lookup',args);
    if(fallback.error){console.warn('VXSK avatar lookup unavailable:',error?.code||fallback.error?.code||'error');return [];}
    return Array.isArray(fallback.data)?fallback.data:[];
  }
  // A profile can be shared even if the friends RPC temporarily omitted the path.
  // Resolve authorized avatar references in batches, preserving all privacy checks.
  async function hydrateFriendsAvatars(links){
    if(!client||!user)return;
    const peers=(links||[]).map(x=>x.peer_id).filter(Boolean);
    for(let i=0;i<peers.length;i+=20){
      const items=await lookupAvatarRefs(peers.slice(i,i+20));
      for(const item of items){
        if(!item.user_id)continue;
        const ref=item.avatar_path||item.avatar_url||'';
        if(item.avatar_path&&item.avatar_url)avatarFallbacks.set(item.avatar_path,item.avatar_url);
        if(!ref)continue;
        for(const target of document.querySelectorAll('.community-avatar[data-vxsk-peer]')){
          if(target.dataset.vxskPeer===item.user_id)void addAvatar(target,item.user_id,ref);
        }
      }
    }
  }
  let presenceMissing=false;
  let lastAlertState={requests:0,unread:0,total:0,ready:false};
  let alertSoundUnlocked=false;
  let alertFunctionMissing=false;

  const categoryMap=[
    ['Rocket League','#games','Game · Four seasonal modes','🚗'],
    ['League of Legends','#modes','Game · 2027 calendar','🗡️'],
    ['VALORANT','#modes','Game · 2027 calendar','🎯'],
    ['Showmatches & event modes','#modes','Calendar · Twelve seasonal phases','🏟️'],
    ['Match fixtures & announcements','#match-center','Official news and pairings','📢'],
    ['No Opponent / Find Rival','#find-rival','Private staff matchmaking request','🧭'],
    ['Team & Staff','#staff','Meet the VXSK crew','👥'],
    ['Contact','#contact','VXSK social and email contacts','✉️'],
    ['My Account','#members','Player account and applications','👤']
  ];
  function note(message){info.textContent=message;}
  const el=(tag,content,cls)=>{const out=document.createElement(tag);if(content!==undefined)out.textContent=String(content);if(cls)out.className=cls;return out;};
  async function rpcQuiet(name,args={}){
    if(!await getSession())return {ok:false,silent:true};
    const {data,error}=await client.rpc(name,args);
    if(error){
      console.warn('VXSK community quiet RPC:',name,error?.code||'error');
      if(/function.*(not|missing)|schema cache|could not find/i.test(error.message||''))return {ok:false,missing:true};
      return {ok:false,error};
    }
    return {ok:true,data};
  }
  function unlockAlertSound(){alertSoundUnlocked=true;}
  document.addEventListener('pointerdown',unlockAlertSound,{passive:true});
  document.addEventListener('keydown',unlockAlertSound,{passive:true});
  function playAlertSound(){
    if(!alertSoundUnlocked)return;
    try{
      const AudioCtx=window.AudioContext||window.webkitAudioContext;
      if(!AudioCtx)return;
      const ctx=new AudioCtx();
      const now=ctx.currentTime;
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      osc.type='sine';
      osc.frequency.setValueAtTime(880,now);
      osc.frequency.linearRampToValueAtTime(1120,now+.11);
      gain.gain.setValueAtTime(0.0001,now);
      gain.gain.exponentialRampToValueAtTime(0.08,now+.01);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+.20);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);osc.stop(now+.22);
      osc.onended=()=>{if(ctx.state!=='closed')void ctx.close().catch(()=>{});};
    }catch(_){/* no-op */}
  }
  function updateAlertBadge(total,requests,unread){
    if(navFriendCount){
      navFriendCount.hidden=!total;
      navFriendCount.textContent=total>99?'99+':String(total);
    }
    if(navFriendsToggle){
      navFriendsToggle.classList.toggle('has-alert',total>0);
      const bits=[];
      if(requests>0)bits.push(`${requests} request${requests===1?'':'s'}`);
      if(unread>0)bits.push(`${unread} unread DM${unread===1?'':'s'}`);
      navFriendsToggle.title=bits.length?('Friends and requests · '+bits.join(' · ')):'Friends and requests';
      navFriendsToggle.setAttribute('aria-label',bits.length?('Open friends and requests, '+bits.join(' and ')):'Open friends and requests');
    }
  }
  async function refreshAlerts({silent=false}={}){
    if(!await getSession()){
      lastAlertState={requests:0,unread:0,total:0,ready:false};
      updateAlertBadge(0,0,0);
      return;
    }
    let requests=Array.isArray(snapshot?.links)?snapshot.links.filter(x=>x.status==='pending'&&!x.outgoing).length:0;
    let unread=0;
    if(!alertFunctionMissing){
      const res=await rpcQuiet('vxsk_social_alerts');
      if(res.ok&&res.data){
        requests=Math.max(0,Number(res.data.requests||0));
        unread=Math.max(0,Number(res.data.unread_messages||0));
      }else if(res.missing){
        alertFunctionMissing=true;
      }
    }
    const total=requests+unread;
    const increased=lastAlertState.ready&&(requests>lastAlertState.requests||unread>lastAlertState.unread);
    updateAlertBadge(total,requests,unread);
    if(increased&&!silent&&document.visibilityState==='visible'){
      playAlertSound();
      if(requests>lastAlertState.requests&&unread>lastAlertState.unread)note('New friend request and new DM received.');
      else if(requests>lastAlertState.requests)note('New friend request received.');
      else if(unread>lastAlertState.unread)note('New DM received.');
    }
    lastAlertState={requests,unread,total,ready:true};
  }
  const iconPaths={
    'CHALLENGE':['M6.5 6.5 17.5 17.5','M17.5 6.5 6.5 17.5','M6 6 3 3','M18 18 21 21'],
    'DM':['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3H13a8.48 8.48 0 0 1 8 8v.5z'],
    'AUDIO':['M11 5 6 9H3v6h3l5 4V5z','M15.5 8.5a5 5 0 0 1 0 7','M19 5a10 10 0 0 1 0 14'],
    'VIDEO':['m23 7-7 5 7 5V7z','M1 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7z'],
    'BLOCK':['M10.9 2.1a10 10 0 1 0 11 11','M3 3l18 18'],
    'UNBLOCK':['M3 3l18 18','M19.5 19.5A10 10 0 0 1 4 6','M20 9a10 10 0 0 1-2-4'],
    'ACCEPT':['M20 6 9 17l-5-5'],
    'REJECT':['M18 6 6 18','M6 6l12 12'],
    'MESSAGE':['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3H13a8.48 8.48 0 0 1 8 8v.5z'],
    'ADD':['M12 5v14','M5 12h14'],
    'REQUEST':['M12 5v14','M5 12h14'],
    'REFRESH':['M20 11a8 8 0 1 0-2.2 5.6','M20 4v7h-7'],
  };
  const makeIcon=(label)=>{
    const key=String(label||'').toUpperCase();
    const name=Object.keys(iconPaths).find(k=>key.startsWith(k));
    if(!name)return null;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');
    svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');
    svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
    svg.setAttribute('aria-hidden','true');svg.classList.add('vxsk-social-icon');
    for(const d of iconPaths[name]){
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',d);svg.append(path);
    }
    return svg;
  };
  function action(label,callback,variant=''){
    const button=el('button',label,'community-action '+variant);button.type='button';
    const ico=makeIcon(label);if(ico)button.prepend(ico);
    button.addEventListener('click',async()=>{
      button.disabled=true;
      try{await callback();}catch(e){note('Request failed. Please try again.');console.warn('VXSK community:',e?.message||'error');}
      finally{button.disabled=false;}
    });return button;
  }
  async function getSession(){
    client=window.VXSKAuth?.client;
    if(!client)return false;
    const {data,error}=await client.auth.getUser();
    user=error?null:data?.user;
    // Account switching must not leave the previous account's chat or friend list visible.
    if((user?.id||null)!==lastIdentity){
      lastIdentity=user?.id||null;
      snapshot=null;peer=null;chat.hidden=true;messages.replaceChildren();
      signedAvatars.clear();avatarFallbacks.clear();renderMiniFriends([]);
      renderBlocklist([]);
      friendsEl.replaceChildren(el('p',user?'Refreshing friends…':'Sign in to manage friends.'));
      if(navFriendsPanel){navFriendsPanel.hidden=true;navFriendsToggle?.setAttribute('aria-expanded','false');document.querySelector('.header')?.removeAttribute('data-friends-open');document.dispatchEvent(new Event('vxsk:friends-panel-change'));}
    }
    return Boolean(user);
  }
  async function rpc(name,args={}){
    if(!await getSession()){note('Sign in to manage your friends and messages.');document.querySelector('.open-account')?.click();return {ok:false};}
    const {data,error}=await client.rpc(name,args);
    if(error){
      if(/function.*(not|missing)|schema cache|could not find/i.test(error.message||'')){
        note('The VXSK community database is not installed in STAGING yet. This is a safe preview; no request was sent.');
      } else note('Action could not be completed. Check your profile, friendship or permissions.');
      console.warn('VXSK community RPC:',name,error?.code||'error');
      return {ok:false};
    }
    return {ok:true,data};
  }
  // Avatars live in a private Supabase bucket. Request a short-lived signed
  // URL only for paths returned by an authorized RPC. Avatar failures must
  // NEVER stop rendering a request or its ACCEPT / REJECT actions.
  async function addAvatar(target,peerId,avatarRef){
    if(!target || !peerId || typeof avatarRef!=='string')return;
    // Group, call and friends avatars share the same identity guard.
    target.dataset.vxskPeer=peerId;
    const storage=client?.storage;
    try{
      const key=avatarRef;
      const cached=signedAvatars.get(key);
      let src=cached && cached.expires>Date.now()+30000 ? cached.url : null;
      if(!src){
        if(avatarRef.startsWith(peerId+'/')){
          if(!storage)return;
          const {data,error}=await storage.from('vxsk-avatars').createSignedUrl(avatarRef,600);
          if(error || !data?.signedUrl){
            console.warn('VXSK avatar signed URL unavailable:',error?.statusCode||error?.code||'storage-policy');
            const fallback=avatarFallbacks.get(avatarRef);
            if(fallback && trustedRemoteAvatar(fallback)){avatarFallbacks.delete(avatarRef);void addAvatar(target,peerId,fallback);}
            return;
          }
          src=data.signedUrl;
          signedAvatars.set(key,{url:src,expires:Date.now()+570000});
        }else if(trustedRemoteAvatar(avatarRef)){
          src=avatarRef;
          signedAvatars.set(key,{url:src,expires:Date.now()+570000});
        }else return;
      }
      if(!target.isConnected || lastIdentity!==user?.id)return;
      const img=document.createElement('img');
      img.alt='';
      img.decoding='async';
      // Critical: a detached lazy image may NEVER start downloading. The
      // initials are replaced only after load, so load eagerly off-DOM.
      // These are tiny avatars, not page-sized media.
      img.loading='eager';
      img.referrerPolicy='no-referrer';
      const apply=()=>{
        if(target.isConnected && target.dataset.vxskPeer===peerId &&
           lastIdentity===user?.id && !target.contains(img))target.replaceChildren(img);
      };
      const fail=()=>{
        signedAvatars.delete(key);
        const fallback=avatarFallbacks.get(key);
        if(fallback && trustedRemoteAvatar(fallback) && target.isConnected){
          avatarFallbacks.delete(key);void addAvatar(target,peerId,fallback);
        }
      };
      img.onload=apply;
      img.onerror=fail;
      img.src=src;
      // decode() also kicks off loading for browsers that defer detached images.
      if(typeof img.decode==='function')void img.decode().then(apply).catch(()=>{});
    }catch(_){/* A missing/expired avatar is cosmetic; the user actions stay visible. */}
  }
  function avatarEl(name,icon=''){
    const label=(icon||((name||'?').trim().charAt(0).toUpperCase()));
    const a=el('span',label,'community-avatar'+(icon?' is-category-icon':''));
    a.setAttribute('aria-hidden','true');return a;
  }
  function makeEntry(title,desc,buttons=[],peerId=null,avatarPath=null,online=null,icon=''){

    const card=el('article',undefined,'community-entry');
    const avatar=avatarEl(title,icon);card.append(avatar);
    if(peerId){avatar.dataset.vxskPeer=peerId;if(avatarPath)void addAvatar(avatar,peerId,avatarPath);}
    const words=el('div',undefined,'community-entry-copy');
    const heading=el('strong',title);words.append(heading);
    const sub=el('small',desc);
    if(online===true||online===false){
      const status=el('span',online?'Online':'Offline','friend-presence '+(online?'is-online':'is-offline'));
      sub.prepend(status);
    }
    words.append(sub);card.append(words);
    const group=el('div',undefined,'community-entry-actions');buttons.forEach(b=>group.append(b));card.append(group);return card;
  }
  const showCommunity=()=>{
    if(navFriendsPanel){navFriendsPanel.hidden=true;navFriendsToggle?.setAttribute('aria-expanded','false');document.querySelector('.header')?.removeAttribute('data-friends-open');}
    document.getElementById('community')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  function renderMiniFriends(links=[]){
    if(!navFriendsEntries)return;
    navFriendsEntries.replaceChildren();
    const accepted=links.filter(x=>x.status==='accepted');
    const incoming=links.filter(x=>x.status==='pending'&&!x.outgoing);
    const outgoing=links.filter(x=>x.status==='pending'&&x.outgoing);
    if(!accepted.length&&!incoming.length&&!outgoing.length){navFriendsEntries.append(el('p','No friends or requests yet. Use Add Friend to find players.'));return;}
    if(incoming.length){navFriendsEntries.append(el('h4','REQUESTS ('+incoming.length+')'));
      for(const item of incoming){
        navFriendsEntries.append(makeEntry(item.nickname||'VXSK PLAYER','New invitation',[
          action('ACCEPT',async()=>{const r=await rpc('vxsk_social_answer',{p_peer:item.peer_id,p_accept:true});if(r.ok&&r.data){note('Friend request accepted.');await refreshState();}else if(r.ok){note('This request is no longer pending. Refresh your friends.');await refreshState();}}),
          action('REJECT',async()=>{const r=await rpc('vxsk_social_answer',{p_peer:item.peer_id,p_accept:false});if(r.ok&&r.data){note('Friend request declined.');await refreshState();}else if(r.ok){note('This request is no longer pending. Refresh your friends.');await refreshState();}},'danger')
        ],item.peer_id,item.avatar_path));
      }
    }
    if(accepted.length){navFriendsEntries.append(el('h4','FRIENDS ('+accepted.length+')'));
      for(const item of accepted.sort((a,b)=>Number(b.online===true)-Number(a.online===true))){
        navFriendsEntries.append(makeEntry(item.nickname||'VXSK PLAYER','FRIEND',[
          action('CHALLENGE',()=>{showCommunity();return challengeFriend(item.peer_id,item.nickname||'PLAYER');}),
          action('DM',()=>{showCommunity();return openChat(item.peer_id,item.nickname||'PLAYER');}),
          action('AUDIO',()=>window.VXSKCalls?.start(item.peer_id,'audio',item.nickname||'PLAYER')),
          action('VIDEO',()=>window.VXSKCalls?.start(item.peer_id,'video',item.nickname||'PLAYER')),
          action('BLOCK',async()=>{
            if(!confirm('Block '+(item.nickname||'this player')+'? You will no longer be friends or receive their private messages.'))return;
            const r=await rpc('vxsk_social_block',{p_peer:item.peer_id,p_block:true});
            if(r.ok&&r.data){if(peer===item.peer_id)closeChat();note('Player blocked. Manage blocked players in MY BLOCKLIST.');await refreshState();}
            else if(r.ok)note('Block could not be completed. Refresh and try again.');
          },'danger')
        ],item.peer_id,item.avatar_path,Boolean(item.online)));
      }
    }
    if(outgoing.length){navFriendsEntries.append(el('h4','SENT REQUESTS ('+outgoing.length+')'));
      for(const item of outgoing){navFriendsEntries.append(makeEntry(item.nickname||'VXSK PLAYER','Waiting for acceptance',[],item.peer_id,item.avatar_path));}
    }
  }
  function handleSearch(){
    const term=search.value.trim().slice(0,30);lastTerm=term;results.replaceChildren();
    const categoryHits=categoryMap.filter(x=>!term||x[0].toLowerCase().includes(term.toLowerCase()) || x[2].toLowerCase().includes(term.toLowerCase()));
    for(const [name,href,subtitle,icon] of categoryHits){const link=el('a','OPEN CATEGORY ↗','community-category-link');link.href=href;results.append(makeEntry(name,subtitle,[link],null,null,null,icon));}
    if(term.length<2){note('Search categories, or enter at least two characters of a player nickname.');return;}
    searchPlayers(term);
  }
  async function searchPlayers(term){
    if(!await getSession()) {note('Showing categories. Sign in to search VXSK players.');return;}
    const response=await rpc('vxsk_social_find_v2',{p_term:term});
    if(!response.ok || term!==lastTerm)return;
    const players=response.data||[];
    for(const p of players){
      const existing=(snapshot?.links||[]).find(x=>x.peer_id===p.user_id);
      const canSendAgain=existing?.status==='rejected' && !existing.outgoing;
      const requestLabel=existing?.status==='accepted'?'ALREADY FRIENDS':
        existing?.status==='pending'?'REQUEST PENDING':
        existing?.status==='rejected'&&existing.outgoing?'REQUEST DECLINED':
        canSendAgain?'SEND NEW REQUEST ↗':'ADD FRIEND ＋';
      const buttons=[action(requestLabel,async()=>{
        const r=await rpc('vxsk_social_request',{p_peer:p.user_id});
        if(r.ok)note(r.data?'Friend request sent! Your friend can accept it in Friends & Requests.':'Request not sent. Check whether it is already pending, blocked, or rate-limited.');
        await refreshState();
      }), action('BLOCK',async()=>{
        if(!confirm('Block this player? They will not be able to find or message you.'))return;
        const r=await rpc('vxsk_social_block',{p_peer:p.user_id,p_block:true});
        if(r.ok){note('Player blocked.');handleSearch();await refreshState();}
      },'danger')];
      buttons[0].disabled=Boolean(existing&&(['accepted','pending'].includes(existing.status)||(existing.status==='rejected'&&existing.outgoing)));
      results.append(makeEntry(p.nickname,'VXSK PLAYER',buttons,p.user_id,p.avatar_path));
    }
    note(players.length?'Choose Add Friend to send a request. Private contact details are never shown.':'No player found. Check the spelling or try another nickname.');
  }
  // Defense-in-depth: one friend card per account even if a backend joins a
  // profile twice. Accepted friendship outranks a stale pending row.
  function uniqueFriendLinks(rows){
    const byPeer=new Map();
    const priority={accepted:3,pending:2,rejected:1};
    for(const link of rows){
      if(!link||typeof link.peer_id!=='string'||!link.peer_id||!['accepted','pending','rejected'].includes(link.status))continue;
      const previous=byPeer.get(link.peer_id);
      if(!previous){byPeer.set(link.peer_id,{...link});continue;}
      const newer=(priority[link.status]||0)>(priority[previous.status]||0);
      const chosen=newer?link:previous;
      const other=newer?previous:link;
      byPeer.set(link.peer_id,{
        ...chosen,
        nickname:chosen.nickname||other.nickname,
        avatar_path:chosen.avatar_path||other.avatar_path||null,
        avatar_url:chosen.avatar_url||other.avatar_url||null,
        online:Boolean(chosen.online||other.online)
      });
    }
    return [...byPeer.values()];
  }
  async function refreshState(){
    const version=++friendsRefreshVersion;
    const signedIn=await getSession();
    if(version!==friendsRefreshVersion)return;
    if(!signedIn){
      snapshot=null;
      friendsEl.replaceChildren(el('p','Sign in to manage friends.'));
      renderMiniFriends([]);
      renderBlocklist([]);
      return;
    }
    const requestedUser=user.id;
    const response=await rpc('vxsk_social_my_state');
    // Rapid refresh, sign-in events and focus events must never append old rows.
    if(version!==friendsRefreshVersion||user?.id!==requestedUser)return;
    if(!response.ok){friendsEl.replaceChildren(el('p','Community setup required.'));renderMiniFriends([]);return;}
    const next=response.data||{};
    const blocks=Array.isArray(next.blocked)
      ?[...new Map(next.blocked.filter(x=>x&&x.peer_id).map(x=>[x.peer_id,x])).values()]:[];
    const blockedIds=new Set(blocks.map(x=>x.peer_id));
    const links=uniqueFriendLinks(Array.isArray(next.links)?next.links:[])
      .filter(x=>!blockedIds.has(x.peer_id));
    snapshot={...next,links,blocked:blocks};
    if(privacyControls)privacyControls.hidden=false;
    if(sharePresence)sharePresence.checked=Boolean(snapshot.profile?.share_presence);
    // Render atomically: NO await between clearing and appending. This was the
    // source of duplicate YOUR FRIENDS sections during overlapping refreshes.
    friendsEl.replaceChildren();
    renderMiniFriends(links);
    if(!links.length)friendsEl.append(el('p','No friends or invitations yet.'));
    const sortedLinks=[
      ...links.filter(x=>x.status==='pending'&&!x.outgoing),
      ...links.filter(x=>x.status==='accepted').sort((a,b)=>Number(b.online===true)-Number(a.online===true)||String(a.nickname).localeCompare(String(b.nickname))),
      ...links.filter(x=>x.status==='pending'&&x.outgoing),
      ...links.filter(x=>x.status==='rejected'&&!x.outgoing)
    ];
    let previousGroup='';
    for(const item of sortedLinks){
      const group=item.status==='accepted'?'YOUR FRIENDS':item.status==='rejected'?'PREVIOUSLY DECLINED':item.outgoing?'SENT REQUESTS':'FRIEND REQUESTS';
      if(group!==previousGroup){friendsEl.append(el('h4',group,'community-group-title'));previousGroup=group;}

      let state=item.status==='accepted'?'FRIEND':item.status==='pending'?(item.outgoing?'INVITE SENT':'NEW INVITE'):'DECLINED';
      const a=[];
      if(item.status==='pending'&&!item.outgoing){
        a.push(action('ACCEPT',async()=>{const r=await rpc('vxsk_social_answer',{p_peer:item.peer_id,p_accept:true});if(r.ok)await refreshState();}));
        a.push(action('REJECT',async()=>{const r=await rpc('vxsk_social_answer',{p_peer:item.peer_id,p_accept:false});if(r.ok&&r.data){note('Friend request declined.');await refreshState();}else if(r.ok){note('This request is no longer pending. Refresh your friends.');await refreshState();}},'danger'));
      }
      if(item.status==='rejected'&&!item.outgoing)a.push(action('SEND NEW REQUEST ↗',async()=>{
        const r=await rpc('vxsk_social_request',{p_peer:item.peer_id});
        if(r.ok)note(r.data?'New request sent!':'Request not sent. Check blocked status or the daily request limit.');
        await refreshState();
      }));
      if(item.status==='accepted')a.push(action('CHALLENGE ⚔',()=>challengeFriend(item.peer_id,item.nickname||'PLAYER')));
      if(item.status==='accepted')a.push(action('MESSAGE',()=>openChat(item.peer_id,item.nickname||'PLAYER')));
      if(item.status==='accepted'){a.push(action('AUDIO CALL',()=>window.VXSKCalls?.start(item.peer_id,'audio',item.nickname||'PLAYER')));a.push(action('VIDEO CALL',()=>window.VXSKCalls?.start(item.peer_id,'video',item.nickname||'PLAYER')));}
      if(item.status!=='rejected')a.push(action('BLOCK',async()=>{
        if(!confirm('Block this player and remove your friendship or request?'))return;
        const r=await rpc('vxsk_social_block',{p_peer:item.peer_id,p_block:true});if(r.ok){if(peer===item.peer_id)closeChat();await refreshState();}
      },'danger'));
      friendsEl.append(makeEntry(item.nickname||'VXSK PLAYER',state,a,item.peer_id,item.avatar_path,item.status==='accepted'&&Boolean(item.online)));
    }
    renderBlocklist(blocks);
    void hydrateFriendsAvatars(links);
    void refreshAlerts({silent:true});
  }
  function renderBlocklist(blocks=[]){
    if(!blockedEl)return;
    blockedEl.replaceChildren();
    if(blockedCount)blockedCount.textContent='('+blocks.length+')';
    if(!user){blockedEl.append(el('p','Sign in to manage blocked players.'));return;}
    if(!blocks.length){blockedEl.append(el('p','No blocked players.'));return;}
    for(const item of [...blocks].sort((a,b)=>String(a.nickname||'').localeCompare(String(b.nickname||'')))){
      const unblock=action('UNBLOCK',async()=>{
        const r=await rpc('vxsk_social_block',{p_peer:item.peer_id,p_block:false});
        if(r.ok&&r.data){note('Player unblocked. You may send a new friend request if you both wish.');await refreshState();}
        else if(r.ok)note('Could not unblock this player.');
      });
      blockedEl.append(makeEntry(item.nickname||'BLOCKED PLAYER','BLOCKED',[unblock],item.peer_id));
    }
  }
  async function challengeFriend(id,name){
    const game=prompt('Challenge '+name+' in which game? Rocket League, VALORANT, or League of Legends','Rocket League');
    if(game===null)return;
    const normalized=game.trim().toLowerCase();
    const valid={'rocket league':'Rocket League','valorant':'VALORANT','league of legends':'League of Legends'};
    if(!valid[normalized]){note('Choose Rocket League, VALORANT, or League of Legends.');return;}
    const mode=prompt('Showmatch mode (example: 1v1, 2v2, 5v5)','1v1');
    if(mode===null)return;
    if(mode.trim().length<2||mode.trim().length>40){note('Mode must be 2–40 characters.');return;}
    const r=await rpc('vxsk_showmatch_invite',{p_peer:id,p_game:valid[normalized],p_mode:mode.trim()});
    if(r.ok)note(r.data?'Challenge sent to '+name+'! Staff will schedule it after acceptance.':'Challenge unavailable. Check friendship, a pending challenge or daily limits.');
    await refreshChallenges();
  }
  async function refreshChallenges(){
    const box=$('vxsk-challenges-list');if(!box)return;
    if(!await getSession()){box.replaceChildren(el('p','Sign in to see your showmatch challenges.'));return;}
    const {data,error}=await client.rpc('vxsk_showmatch_mine');
    box.replaceChildren();
    if(error){box.append(el('p','Showmatch challenge setup required. Run the V12.8.22 STAGING migration.'));return;}
    if(!data?.length){box.append(el('p','No challenges yet. Open Friends & Requests, pick a friend, and tap CHALLENGE.'));return;}
    for(const c of data){
      const buttons=[];
      if(c.state==='pending'&&c.incoming){
        buttons.push(action('ACCEPT',async()=>{const r=await rpc('vxsk_showmatch_answer',{p_challenge:c.id,p_accept:true});if(r.ok)await refreshChallenges();}));
        buttons.push(action('DECLINE',async()=>{const r=await rpc('vxsk_showmatch_answer',{p_challenge:c.id,p_accept:false});if(r.ok)await refreshChallenges();},'danger'));
      }else if(c.state==='pending')buttons.push(action('CANCEL',async()=>{const r=await rpc('vxsk_showmatch_cancel',{p_challenge:c.id});if(r.ok)await refreshChallenges();}));
      box.append(makeEntry(c.peer_name,c.game+' · '+c.mode+' · '+c.state.toUpperCase()+(c.incoming?' · CHALLENGED YOU':''),buttons));
    }
  }
  async function openChat(id,name){peer=id;peerName=name;chat.hidden=false;chatTitle.textContent='PRIVATE CHAT · '+name;await refreshChat();void rpcQuiet('vxsk_social_mark_dm_seen',{p_peer:id}).then(()=>refreshAlerts({silent:true}));chat.scrollIntoView({behavior:'smooth',block:'nearest'});}
  function closeChat(){peer=null;chat.hidden=true;messages.replaceChildren();}
  async function refreshChat(){
    if(!peer||document.hidden)return;
    const requestedPeer=peer;
    const r=await rpc('vxsk_social_dm_history',{p_peer:peer});if(!r.ok||peer!==requestedPeer)return;
    messages.replaceChildren();
    // One batched reaction read for this visible DM history; RLS restricts it to
    // message participants. If the optional Arena migration is not yet installed,
    // existing chat continues normally with no broken buttons.
    const history=(r.data||[]).slice().reverse();
    const hasIncoming=history.some(entry=>!entry.from_me);
    let reactionEnabled=false;
    const reactions=new Map();
    const ids=history.map(entry=>entry.message_id).filter(Boolean).slice(0,75);
    if(ids.length){
      const response=await client.from('vxsk_hub_reactions').select('message_id,emoji').in('message_id',ids).limit(150);
      if(!response.error){reactionEnabled=true;for(const x of response.data||[]){
        const curr=reactions.get(x.message_id)||[];curr.push(x.emoji);reactions.set(x.message_id,curr);
      }}
    }
    for(const entry of history){
      const line=el('div',undefined,'community-message '+(entry.from_me?'from-me':'from-friend'));
      line.append(el('span',entry.body));
      const time=el('small',new Date(entry.sent_at).toLocaleString());line.append(time);
      if(reactionEnabled && entry.message_id){
        const tray=el('span',undefined,'vxsk-dm-reactions');
        const chosen=reactions.get(entry.message_id)||[];
        const summary=el('small',chosen.length?'REACTIONS '+chosen.join(' '):'REACT');tray.append(summary);
        for(const emoji of ['👍','💜','🔥','😂','👏']){
          const button=action(emoji,async()=>{
            const outcome=await rpc('vxsk_hub_react',{p_message:entry.message_id,p_emoji:emoji});
            if(outcome.ok && outcome.data)await refreshChat();
          },'vxsk-dm-react');
          button.title='React with '+emoji;
          tray.append(button);
        }
        line.append(tray);
      }
      if(!entry.from_me){line.append(action('REPORT',async()=>{
        const reason=prompt('Why are you reporting this message? (4–200 characters)');
        if(reason===null)return;
        if(reason.length<4||reason.length>200){note('Please describe the issue in 4–200 characters.');return;}
        const outcome=await rpc('vxsk_social_report_dm',{p_message_id:entry.message_id,p_reason:reason});
        if(outcome.ok)note(outcome.data?'Message reported to the VXSK moderation queue.':'Report could not be submitted.');
      },'report'));}
      messages.append(line);
    }
    if(!(r.data||[]).length)messages.append(el('p','You are connected. Say hello without sharing personal details.'));
    messages.scrollTop=messages.scrollHeight;
    if(hasIncoming){void rpcQuiet('vxsk_social_mark_dm_seen',{p_peer:peer}).then(()=>refreshAlerts({silent:true}));}
  }
  navForm?.addEventListener('submit',e=>{
    e.preventDefault();const query=navSearch?.value.trim().slice(0,30)||'';
    search.value=query;showCommunity();handleSearch();search.focus({preventScroll:true});
  });
  $('nav-add-friend')?.addEventListener('click',()=>{showCommunity();search.focus({preventScroll:true});});
  navFriendsToggle?.addEventListener('click',async()=>{
    navFriendsPanel.hidden=!navFriendsPanel.hidden;
    navFriendsToggle.setAttribute('aria-expanded',String(!navFriendsPanel.hidden));
    document.querySelector('.header')?.setAttribute('data-friends-open',String(!navFriendsPanel.hidden));
    document.dispatchEvent(new Event('vxsk:friends-panel-change'));
    if(!navFriendsPanel.hidden)await refreshState();
  });
  $('nav-friends-close')?.addEventListener('click',()=>{navFriendsPanel.hidden=true;navFriendsToggle.setAttribute('aria-expanded','false');document.querySelector('.header')?.removeAttribute('data-friends-open');});
  $('nav-friends-refresh')?.addEventListener('click',refreshState);
  $('nav-friends-add')?.addEventListener('click',()=>{showCommunity();search.focus({preventScroll:true});});
  $('nav-friends-manage')?.addEventListener('click',showCommunity);
  document.addEventListener('click',event=>{
    if(navFriendsPanel&&!navFriendsPanel.hidden&&!event.target.closest('.vxsk-community-nav')){
      navFriendsPanel.hidden=true;navFriendsToggle?.setAttribute('aria-expanded','false');document.querySelector('.header')?.removeAttribute('data-friends-open');
    }
  });
  // Presence reports only a recent visible browser heartbeat. It is never a
  // precise indication of what someone is doing and isn't shared to strangers.
  async function heartbeat(){
    if(document.hidden||presenceMissing||!snapshot?.profile?.share_presence)return;
    const api=window.VXSKAuth?.client;if(!api)return;
    const {data:{user:me},error}=await api.auth.getUser();
    if(error||!me)return;
    const res=await api.rpc('vxsk_social_heartbeat');
    if(res.error&&/function|schema cache|could not find/i.test(res.error.message||''))presenceMissing=true;
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){void heartbeat();void refreshState();}});
  setInterval(()=>{if(!document.hidden){void heartbeat();void refreshState();}},75000);
  $('community-save-privacy')?.addEventListener('click',async()=>{
    if(!snapshot?.profile)return;
    const r=await rpc('vxsk_social_privacy',{p_share_avatar:true,p_share_presence:sharePresence.checked});
    if(r.ok){note(r.data?'Online status saved. Friends will see you '+(sharePresence.checked?'Online when active.':'Offline.'):'Could not save online status.');await refreshState();await heartbeat();}
  });
  $('community-go').addEventListener('click',handleSearch);
  search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();handleSearch();}});
  $('vxsk-challenges-refresh')?.addEventListener('click',refreshChallenges);
  $('community-refresh').addEventListener('click',refreshState);
  $('community-blocklist-refresh')?.addEventListener('click',()=>void refreshState());
  $('community-chat-close').addEventListener('click',closeChat);
  $('community-message-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!peer)return;
    const box=$('community-message-text');const text=box.value.trim();
    if(!text||text.length>500)return;
    const r=await rpc('vxsk_social_send_dm',{p_peer:peer,p_message:text});
    if(r.ok){if(r.data){box.value='';await refreshChat();await refreshAlerts({silent:true});}else note('Message not sent. You must be accepted friends and under the message rate limit.');}
  });
  window.addEventListener('vxsk:auth-updated',()=>{void refreshState();void refreshChallenges();void refreshAlerts({silent:true});});
  window.addEventListener('vxsk:auth-change',()=>{void refreshState();void refreshChallenges();void refreshAlerts({silent:true});});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&peer)refreshChat();});
  setInterval(()=>{if(peer&&!document.hidden)refreshChat();},20000);
  setInterval(()=>{if(!document.hidden)void refreshAlerts();},15000);
  // Expose only the current accepted-friends snapshot and opt-in avatars to
  // the call UI. Storage permissions still verify every signed URL request.
  window.VXSKCommunity=Object.freeze({
    refreshFriendAvatar:async (node,id)=>{
      await refreshState();
      const item=(snapshot?.links||[]).find(x=>x.status==='accepted'&&x.peer_id===id);
      let ref=item?.avatar_path||item?.avatar_url||'';
      if(!ref){
        const found=await lookupAvatarRefs([id]);
        if(found[0]?.avatar_path&&found[0]?.avatar_url)avatarFallbacks.set(found[0].avatar_path,found[0].avatar_url);
        ref=found[0]?.avatar_path||found[0]?.avatar_url||'';
      }
      if(ref&&node?.isConnected)await addAvatar(node,id,ref);
    },
    friend: id=>(snapshot?.links||[]).find(x=>x.status==='accepted'&&x.peer_id===id)||null,
    addVisibleAvatar: async (node,id,path)=>{if(node&&id&&path)await addAvatar(node,id,path);},
    addFriendAvatar: async (node,id)=>{
      const item=(snapshot?.links||[]).find(x=>x.status==='accepted'&&x.peer_id===id);
      let ref=item?.avatar_path||item?.avatar_url||'';
      if(!ref){
        const found=await lookupAvatarRefs([id]);
        if(found[0]?.avatar_path&&found[0]?.avatar_url)avatarFallbacks.set(found[0].avatar_path,found[0].avatar_url);
        ref=found[0]?.avatar_path||found[0]?.avatar_url||'';
      }
      if(ref)await addAvatar(node,id,ref);
    }
  });
  handleSearch();
  // Async auth can finish after this module initializes.
  setTimeout(async()=>{await refreshState();await heartbeat();await refreshChallenges();await refreshAlerts({silent:true});},1200);
})();
