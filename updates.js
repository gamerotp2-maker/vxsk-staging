/* VXSK published post notifications — public, no private player data, no email delivery. */
'use strict';
(() => {
  const trigger=document.getElementById('vxsk-updates-toggle');
  const pane=document.getElementById('vxsk-updates-panel');
  const list=document.getElementById('vxsk-updates-list');
  const count=document.getElementById('vxsk-updates-count');
  if(!trigger||!pane||!list)return;
  const cfg=window.VXSK_SUPABASE||{};
  let last=[];
  let visited=0;
  try{visited=Number(localStorage.getItem('vxsk_last_announcement_seen')||0);}catch(_){visited=0;}
  const node=(tag,text,cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
  function draw(){
    list.replaceChildren();
    if(!last.length){list.append(node('p','No public announcements or fixtures yet.','updates-empty'));return;}
    for(const item of last){
      const a=document.createElement('a');a.href='#match-center';
      a.className='updates-item';
      a.append(node('strong',String(item.title||'VXSK Update').slice(0,100)),node('small',item.kind==='match'?'Fixture':'Announcement'));
      a.addEventListener('click',()=>close());list.append(a);
    }
  }
  async function refresh(){
    if(window.VXSK_STAGING_BLOCKED||document.hidden||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url||'')||
      !cfg.publishableKey||cfg.publishableKey.includes('PASTE_'))return;
    try{
      const url=cfg.url+'/rest/v1/match_center_posts?select=id,title,kind,created_at&published=eq.true&order=created_at.desc&limit=12';
      const response=await fetch(url,{headers:{apikey:cfg.publishableKey},cache:'no-store'});
      if(!response.ok)throw new Error('Request failed');
      const data=await response.json();
      if(!Array.isArray(data))return;
      last=data;
      const unseen=last.filter(x=>new Date(x.created_at).getTime()>visited).length;
      count.textContent=unseen>9?'9+':String(unseen);
      count.hidden=unseen===0;
      draw();
    }catch(_){list.replaceChildren(node('p','Announcements temporarily unavailable.','updates-empty'));}
  }
  function close(){pane.hidden=true;trigger.setAttribute('aria-expanded','false');}
  trigger.addEventListener('click',()=>{
    pane.hidden=!pane.hidden;
    trigger.setAttribute('aria-expanded',String(!pane.hidden));
    if(!pane.hidden){
      visited=Date.now();
      try{localStorage.setItem('vxsk_last_announcement_seen',String(visited));}catch(_){}
      count.hidden=true;draw();
    }
  });
  document.addEventListener('click',e=>{if(!pane.hidden&&!e.target.closest('#vxsk-updates-widget'))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  refresh();setInterval(refresh,120000);
})();
