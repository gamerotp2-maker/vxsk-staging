/* VXSK public fixtures and announcements. Read-only, published content only. */
'use strict';
(async () => {
  const list = document.getElementById('match-list');
  const newsList = document.getElementById('bulletin-announcements');
  if (!list) return;
  const cfg = window.VXSK_SUPABASE || {};
  if (window.VXSK_STAGING_BLOCKED || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url || '') ||
      !cfg.publishableKey || cfg.publishableKey.includes('PASTE_') ||
      typeof fetch !== 'function') return; // Legacy static fixture fallback.
  const query='?select=id,kind,title,game,mode,player_a,player_b,starts_at,body,status,cover_path,created_at&published=eq.true&order=created_at.desc&limit=50';
  let posts;
  try {
    const response=await fetch(cfg.url+'/rest/v1/match_center_posts'+query,{headers:{apikey:cfg.publishableKey}});
    if(!response.ok)throw new Error('Public match data unavailable');
    posts=await response.json();
    if(!Array.isArray(posts))throw new Error('Unexpected match data');
  } catch(_err) { console.warn('Match Center unavailable; preserving fallback.'); return; }
  const announcement = posts.filter(p=>p.kind==='announcement');
  const matches = posts.filter(p=>p.kind==='match').sort((a,b)=>{
    const aEnd = ['completed','cancelled'].includes(a.status)?1:0;
    const bEnd = ['completed','cancelled'].includes(b.status)?1:0;
    return aEnd-bEnd || new Date(a.starts_at)-new Date(b.starts_at);
  });
  list.replaceChildren();
  if(newsList)newsList.replaceChildren();
  const makeText = (tag, value, className) => {
    const e=document.createElement(tag); e.textContent=String(value || '');
    if(className) e.className=className;
    return e;
  };
  const parseLinks=value=>{
    const lines=String(value||'').split('\n');
    let stream='',replay='',discord='';
    const desc=lines.filter(line=>{
      if(/^VXSK Stream: https:\/\//i.test(line)){stream=line.replace(/^VXSK Stream: /i,'').trim();return false;}
      if(/^VXSK Replay: https:\/\//i.test(line)){replay=line.replace(/^VXSK Replay: /i,'').trim();return false;}
      if(/^VXSK Discord: https:\/\//i.test(line)){discord=line.replace(/^VXSK Discord: /i,'').trim();return false;}
      return true;
    }).join('\n').trim();
    return {desc,stream,replay,discord};
  };
  const safeLink=(value,hosts)=>{
    try{
      const link=new URL(value);
      if(link.protocol!=='https:'||!hosts.some(h=>link.hostname===h||link.hostname.endsWith('.'+h)))return null;
      return link;
    }catch(_){return null;}
  };
  const brandFromUrl=url=>{
    if(!url)return '';
    if(/youtube\.com|youtu\.be/i.test(url))return 'youtube';
    if(/kick\.com/i.test(url))return 'kick';
    if(/discord\.gg|discord\.com/i.test(url))return 'discord';
    if(/twitch\.tv/i.test(url))return 'twitch';
    return 'generic';
  };
  const brandToken=(brand,label)=>{
    const token=document.createElement('span');
    token.className='vxsk-link-token brand-'+brand;
    token.textContent=label;
    return token;
  };
  const mediaLink=(href,label,brand,token)=>{
    const a=document.createElement('a');
    a.className='vxsk-match-media-link vxsk-brand-'+brand;
    a.href=href; a.target='_blank'; a.rel='noopener noreferrer';
    a.append(brandToken(brand,token), makeText('span',label,'vxsk-link-copy'));
    return a;
  };
  const dateFormat = value => {
    const d=new Date(value);
    return Number.isNaN(d.getTime()) ? 'Time TBA' : d.toLocaleString('en-GB',
      {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Africa/Tunis'})+' (Tunis time)';
  };
  const poster=post=>window.VXSKCover?.image(publicApi,post.cover_path);
  const publicApi=window.supabase?.createClient?.(cfg.url,cfg.publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  for (const post of announcement) {
    const card=makeText('article','','match-card vxsk-announcement-card');
    const art=poster(post);if(art)card.append(art);
    card.append(makeText('span','✦  VXSK / OFFICIAL ANNOUNCEMENT','match-kicker'));
    card.append(makeText('h3',post.title,'vxsk-announcement-title'));
    card.append(makeText('p',post.body,'vxsk-announcement-copy'));
    (newsList||list).append(card);
  }
  if(newsList && !newsList.childElementCount){
    const blank=document.createElement('div');blank.className='empty-state';
    blank.append(makeText('span','✦','empty-signal'),makeText('h3','NEWS COMING SOON'),makeText('p','Official announcements will appear here when staff publish them.'));
    newsList.append(blank);
  }
  for (const post of matches) {
    if (!post.player_a || !post.player_b || !post.starts_at) continue;
    const card=makeText('article','','match-card');
    const art=poster(post);if(art)card.append(art);
    card.append(makeText('span',(post.game || 'VXSK')+' / '+(post.mode||'Showmatch'),'match-kicker'));
    if(post.title) card.append(makeText('h3',post.title,'vxsk-match-title'));
    const names=makeText('div','','match-names');
    names.append(makeText('b',post.player_a),makeText('span','VS'),makeText('b',post.player_b));
    card.append(names);
    const date=makeText('time',dateFormat(post.starts_at));
    date.dateTime=post.starts_at; card.append(date);
    const {desc,stream,replay,discord}=parseLinks(post.body);
    if(desc)card.append(makeText('p',desc,'vxsk-match-description'));
    const wrap=document.createElement('div');wrap.className='vxsk-match-media-links';
    const streamLink=safeLink(stream,['youtube.com','youtu.be','twitch.tv','kick.com']);
    if(streamLink){
      const brand=brandFromUrl(streamLink.href);
      const label=brand==='youtube'?'WATCH LIVE ON YOUTUBE ↗':brand==='kick'?'WATCH LIVE ON KICK ↗':brand==='twitch'?'WATCH LIVE ON TWITCH ↗':'WATCH STREAM ↗';
      const token=brand==='youtube'?'▶':brand==='kick'?'K':brand==='twitch'?'T':'•';
      wrap.append(mediaLink(streamLink.href,label,brand,token));
    }
    const replayLink=safeLink(replay,['youtube.com','youtu.be']);
    if(replayLink)wrap.append(mediaLink(replayLink.href,'WATCH YOUTUBE REPLAY ↗','youtube','▶'));
    const discordLink=safeLink(discord,['discord.gg','discord.com']);
    if(discordLink)wrap.append(mediaLink(discordLink.href,'JOIN DISCORD / CONTACT TEAM ↗','discord','◎'));
    if(wrap.childElementCount)card.append(wrap);
    card.append(makeText('p',(post.status||'scheduled').toUpperCase(),'match-status'));
    list.append(card);
  }
  if (!list.childElementCount) {
    const card=makeText('div','','empty-state');
    card.append(makeText('span','✦','empty-signal'),makeText('h3','FIXTURES IN PREPARATION'),makeText('p','No confirmed pairings announced yet. VXSK will publish matchups, times and announcements here.'));
    list.append(card);
  }
})();
