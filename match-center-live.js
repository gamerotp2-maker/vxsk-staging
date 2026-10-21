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
  const query='?select=id,kind,title,game,mode,player_a,player_b,starts_at,body,status,created_at&published=eq.true&order=created_at.desc&limit=50';
  let posts;
  try {
    // Read through the anonymous Supabase REST API; RLS filters non-published rows.
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
  const dateFormat = value => {
    const d=new Date(value);
    return Number.isNaN(d.getTime()) ? 'Time TBA' : d.toLocaleString('en-GB',
      {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Africa/Tunis'})+' (Tunis time)';
  };
  for (const post of announcement) {
    const card=makeText('article','','match-card vxsk-announcement-card');
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
    card.append(makeText('span',(post.game || 'VXSK')+' / '+(post.mode||'Showmatch'),'match-kicker'));
    if(post.title) card.append(makeText('h3',post.title,'vxsk-match-title'));
    const names=makeText('div','','match-names');
    names.append(makeText('b',post.player_a),makeText('span','VS'),makeText('b',post.player_b));
    card.append(names);
    const date=makeText('time',dateFormat(post.starts_at));
    date.dateTime=post.starts_at; card.append(date);
    if(post.body) card.append(makeText('p',post.body,'vxsk-match-description'));
    card.append(makeText('p',(post.status||'scheduled').toUpperCase(),'match-status'));
    list.append(card);
  }
  if (!list.childElementCount) {
    const card=makeText('div','','empty-state');
    card.append(makeText('span','✦','empty-signal'),makeText('h3','FIXTURES IN PREPARATION'),makeText('p','No confirmed pairings announced yet. VXSK will publish matchups, times and announcements here.'));
    list.append(card);
  }
})();
