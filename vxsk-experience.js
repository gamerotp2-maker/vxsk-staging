"use strict";
(() => {
  // Visual previews use shipped VXSK media; all entries are static local values.
  const previewMap = {
    '#about': [['THE EVENT','WHAT IS VXSK?','An annual gaming event created by Voxzan and Shark.','assets/vxsk-about-brand.webp','#about'],['THE FOUNDER','MEET VOXZAN','Meet the creator behind the VXSK arena.','assets/founder-voxzan-1.webp','#founders']],
    '#games': [['ROCKET LEAGUE','LIVE ARENA','Duel, duo, trio & freestyle.','assets/game-rocket-custom.webp','#games'],['VALORANT','COMING SOON','Tactical showdowns are next.','assets/game-valorant-custom.webp','#games'],['LEAGUE OF LEGENDS','COMING SOON','New legends will rise.','assets/game-league-custom.webp','#games']],
    '#modes': [['ROCKET LEAGUE','FOUR FORMATS','Oct 2026 to Feb 2027.','assets/game-rocket-custom.webp','#modes'],['LEAGUE OF LEGENDS','FOUR SHOWMATCHES','Mar to Jul 2027.','assets/game-league-custom.webp','#modes'],['VALORANT','FOUR SHOWMATCHES','Aug to Nov 2027.','assets/game-valorant-custom.webp','#modes']],
    '#match-center': [['THE ARENA BULLETIN','OFFICIAL UPDATES','Confirmed fixtures & announcements.','assets/vxsk-announcement-wide.webp','#match-center']],
    '#community': [['VXSK COMMUNITY','FIND YOUR SQUAD','One-click friend requests, auto-discovery and private messaging.','assets/game-rocket-custom.webp','#community']],
    '#find-rival': [['FIND RIVAL','THE NEXT CHALLENGER','Meet a future opponent.','assets/mode-duel.webp','#find-rival']],
    '#staff': [['THE TEAM','THE PEOPLE BEHIND VXSK','Meet the team behind the event.','assets/staff-shark.webp','#staff'],['OUR CREATIVE TEAM','STAFF','Creators, casters and organizers.','assets/staff-dyfe.webp','#staff']],
    '#videos': [['WATCH VXSK','MOMENTS ON SCREEN','Watch real highlights from our YouTube picks.','https://i.ytimg.com/vi/UPIJv_3sWC4/hqdefault.jpg','#videos']],
    '#sponsor': [['N2XT ESPORTS','OFFICIAL PARTNER','Competitive esports team from Tunisia.','assets/n2xt-official-logo.png','#sponsor']],
    '#members': [['PLAYER ACCOUNTS','YOUR ARENA','Your profile, sign-in and security.','assets/member-account-preview.svg','#members']],
    '#contact': [['CONTACT','STAY CONNECTED','Join the community and socials.','assets/social-reference/discord.webp','#contact']]
  };
  const header=document.querySelector('.header');
  const preview=document.querySelector('#nav-hover-panel');
  const links=document.querySelectorAll('#nav-links a');
  const desktop=()=>window.matchMedia('(min-width:1271px) and (hover:hover)').matches;
  const friendsOpen=()=>{const p=document.getElementById('nav-friends-panel');return p && !p.hidden;};
  const communityNav=document.querySelector('.vxsk-community-nav');
  const show=(href)=>{
    if(!desktop() || !preview || !previewMap[href] || friendsOpen() || document.activeElement?.closest('.vxsk-community-nav'))return;
    preview.replaceChildren();
    const inner=document.createElement('div');inner.className='nav-preview-grid shell';
    previewMap[href].forEach(([name,title,desc,img,target])=>{
      const a=document.createElement('a');a.href=target;a.className='nav-preview-card';
      const pic=document.createElement('img');pic.src=img;pic.alt='';pic.loading='lazy';pic.referrerPolicy='no-referrer';pic.addEventListener('error',()=>{ if(pic.src.includes('ytimg.com')) pic.src='assets/vxsk-announcement-wide.webp'; },{once:true});
      const copy=document.createElement('span');copy.className='nav-preview-copy';
      const small=document.createElement('small');small.textContent=name;
      const strong=document.createElement('strong');strong.textContent=title;
      const text=document.createElement('span');text.textContent=desc;
      copy.append(small,strong,text);a.append(pic,copy);inner.append(a);
    });
    preview.append(inner);preview.hidden=false;
  };
  const hide=()=>{if(preview)preview.hidden=true;};
  communityNav?.addEventListener('pointerenter',hide);
  communityNav?.addEventListener('focusin',hide);
  communityNav?.addEventListener('click',hide);
  document.addEventListener('vxsk:friends-panel-change',hide);
  links.forEach(a=>{a.addEventListener('mouseenter',()=>show(a.getAttribute('href')));a.addEventListener('focus',()=>show(a.getAttribute('href')));});
  header?.addEventListener('mouseleave',hide);
  header?.addEventListener('focusout',event=>{if(!header.contains(event.relatedTarget))hide();});
  header?.addEventListener('click',event=>{if(event.target.closest('a'))hide();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  window.addEventListener('resize',()=>{if(!desktop())hide();});

  // V12.8.34 background music. Playback remains opt-in and subject to browser audio permissions.
  const music=document.querySelector('#music-toggle');
  const audio=new Audio('assets/vxsk-background-music-v12834.mp3');
  audio.loop=true;audio.volume=0.24;audio.preload='none';
  const update=()=>{
    music?.setAttribute('aria-pressed',String(!audio.paused));
    music?.setAttribute('aria-label',audio.paused?'Play VXSK background music':'Mute VXSK background music');
    music?.setAttribute('title',audio.paused?'Play VXSK background music':'Pause VXSK background music');
    const label=music?.querySelector('span');if(label)label.textContent=audio.paused?'OFF':'ON';
  };
  music?.addEventListener('click',async()=>{
    if(audio.paused){
      try{await audio.play();}
      catch(e){
        console.warn('VXSK music playback unavailable:',e?.name || 'PlaybackError');
        if(music)music.title='Music playback unavailable in this browser';
      }
    } else audio.pause();
    update();
  });
  audio.addEventListener('ended',update);audio.addEventListener('pause',update);
  update();
})();
