
'use strict';
/* VXSK V12.9.3-P3: Header member autocomplete. No credentials, new endpoints or public user enumeration.
   Existing vxsk_social_find_v2 currently returns zero for 1-char terms; preview accepted friends only
   until the optional 1-character server migration is separately applied. */
(() => {
  const doc = document;
  const input = doc.getElementById('nav-player-search');
  const form = doc.getElementById('nav-player-search-form');
  if (!input || !form || doc.getElementById('vxsk-header-suggest')) return;
  input.placeholder = 'Find VXSK players…';
  const panel = doc.createElement('div');
  panel.id = 'vxsk-header-suggest';
  panel.className = 'vxsk-header-suggest';
  panel.hidden = true;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Player nickname suggestions');
  const status = doc.createElement('p');status.className='vxsk-header-search-status';
  const list = doc.createElement('div');list.className='vxsk-header-search-list';
  list.setAttribute('role','list');
  panel.append(status,list);doc.body.append(panel);
  let timer = null,sequence = 0,uid = null;
  let friendCache = [], friendCacheUntil = 0;
  const isVisible = () => input.getClientRects().length > 0;
  function place() {
    if (!isVisible()) {panel.hidden=true;return;}
    const r=input.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth- Math.min(360,window.innerWidth-16)))}px`;
    panel.style.top = `${Math.min(window.innerHeight-40,r.bottom+8)}px`;
    panel.style.width = `${Math.min(360,window.innerWidth-16)}px`;
  }
  function close(){panel.hidden=true;}
  function show(message){place();panel.hidden=false;status.textContent=message;list.replaceChildren();}
  function resultRow(person){
    const button=doc.createElement('button');button.type='button';button.className='vxsk-header-search-result';
    const avatar=doc.createElement('span');avatar.className='vxsk-header-search-avatar';
    avatar.textContent=String(person.nickname||'?').slice(0,1).toUpperCase();
    const name=doc.createElement('strong');name.textContent=String(person.nickname||'VXSK player').slice(0,35);
    const action=doc.createElement('small');action.textContent='VIEW & ADD ↗';
    button.append(avatar,name,action);
    button.addEventListener('click',()=>{
      close();input.value=String(person.nickname||'');
      // Existing My Account handler owns navigation, original community.js owns auth + requests.
      const q=doc.getElementById('community-search');
      if(q) q.value=input.value;
      const link=doc.createElement('a');link.href='#community-search';link.hidden=true;
      doc.body.append(link);link.click();link.remove();
      doc.getElementById('community-go')?.click();
    });
    return button;
  }
  async function query(){
    const term=input.value.trim().slice(0,30);
    const current=++sequence;
    if (!term){close();return;}
    show('Searching players…');
    const api=window.VXSKAuth?.client;
    if(!api){status.textContent='Sign in to search VXSK players.';return;}
    try {
      const auth=await api.auth.getUser();
      const newUid=auth.error?null:auth.data?.user?.id;
      if(current!==sequence)return;
      if (!newUid){status.textContent='Sign in to search verified players.';return;}
      if(uid!==newUid){uid=newUid;friendCache=[];friendCacheUntil=0;}
      let matches=[];
      if (term.length===1){
        // Server search permits 2+ chars today. Show matching accepted friends for 1 letter,
        // and blend server 1-char results when optional owner migration is applied.
        if(Date.now()>friendCacheUntil){
          const friends=await api.rpc('vxsk_social_my_state');
          if(!friends.error){friendCache=(friends.data?.links||[]).filter(x=>x?.status==='accepted' && typeof x.nickname==='string');friendCacheUntil=Date.now()+20000;}
        }
        const local=friendCache.filter(x=>x.nickname.toLocaleLowerCase().includes(term.toLocaleLowerCase()))
          .map(x=>({user_id:x.peer_id,nickname:x.nickname}));
        const remote=await api.rpc('vxsk_social_find_v2',{p_term:term});
        const returned=remote.error?[]:Array.isArray(remote.data)?remote.data:[];
        matches=[...new Map([...returned,...local].filter(x=>x.user_id&&x.nickname).map(x=>[x.user_id,x])).values()].slice(0,12);
        if (current!==sequence)return;
        status.textContent=returned.length?'Matching players · 1 letter':
          '1 letter: matching friends (all players require server search upgrade)';
      } else {
        const found=await api.rpc('vxsk_social_find_v2',{p_term:term});
        if(current!==sequence)return;
        if(found.error){status.textContent='Player search unavailable. Try again.';return;}
        matches=Array.isArray(found.data)?found.data.slice(0,12):[];
        status.textContent=matches.length?`${matches.length} matching player${matches.length===1?'':'s'}`:'No matching players';
      }
      if(current!==sequence)return;
      list.replaceChildren(...matches.map(resultRow));
      panel.hidden=false;place();
      if(!matches.length && term.length===1)status.textContent='No matching friends yet. Type 2 letters for all players.';
    }catch(_){if(current===sequence)status.textContent='Search unavailable. Try again.';}
  }
  input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>void query(),240);});
  input.addEventListener('focus',()=>{if(input.value.trim())void query();});
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){close();input.blur();}});
  form.addEventListener('submit',()=>{close();});
  doc.addEventListener('pointerdown',e=>{if(!panel.contains(e.target)&&e.target!==input)close();});
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)close();});
  window.addEventListener('resize',()=>{if(!panel.hidden)place();},{passive:true});
  window.addEventListener('scroll',()=>{if(!panel.hidden)place();},{passive:true});
  window.addEventListener('vxsk:auth-change',()=>{sequence++;uid=null;friendCache=[];close();});
})();
