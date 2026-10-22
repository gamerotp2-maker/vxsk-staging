/* VXSK V12.8.29 — one staff command dashboard, four focused views.
   These are navigation controls, never a substitute for Supabase authorization. */
'use strict';
(() => {
  const tabs=[...document.querySelectorAll('[data-staff-tab]')];
  const views=[...document.querySelectorAll('[data-staff-view]')];
  if(!tabs.length||!views.length)return;
  const valid=new Set(views.map(node=>node.dataset.staffView));
  function open(name){
    if(!valid.has(name))name='applications';
    const targetTab=document.querySelector('[data-staff-tab="'+name+'"]');
    if(!targetTab||targetTab.hidden)name='applications';
    for(const button of tabs){
      const active=button.dataset.staffTab===name;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    }
    for(const view of views)view.hidden=view.dataset.staffView!==name;
    if(name==='opponents'){
      const inbox=document.getElementById('opponent-inbox');
      if(inbox)inbox.hidden=false;
      window.dispatchEvent(new Event('vxsk:opponent-inbox-open'));
    }
    if(name==='tournaments')window.dispatchEvent(new Event('vxsk:staff-tournaments-open'));
    if(name==='team')window.dispatchEvent(new Event('vxsk:owner-team-open'));
    if(name==='bulletin')window.dispatchEvent(new Event('vxsk:staff-showmatches-open'));
    // Back/refresh should not silently open a hidden area.
    try{history.replaceState(null,'','#'+name);}catch(_){/* file preview */}
  }
  for(const button of tabs)button.addEventListener('click',()=>open(button.dataset.staffTab));
  window.addEventListener('vxsk:staff-ready',async({detail})=>{
    const ownerTab=document.getElementById('staff-owner-team-tab');
    if(ownerTab)ownerTab.hidden=detail?.role!=='owner';
    if(!['owner','reviewer'].includes(detail?.role)){
      const opp=document.querySelector('[data-staff-tab="opponents"]');
      if(opp)opp.hidden=true;
    }
    const chosen=location.hash.slice(1);
    open(valid.has(chosen)?chosen:'applications');
    // Showmatch queue is visible to MFA-verified reviewers; actual editing and
    // publishing is still gated separately by can_edit_match_center + Supabase RLS.
    const api=window.VXSK_STAFF_API;
    if(api){
      try{
        const {data,error}=await api.rpc('vxsk_hub_referee');
        const tab=document.querySelector('[data-staff-tab="bulletin"]');
        if(tab&&(error||data!==true)){tab.hidden=true;if(!document.getElementById('staff-view-bulletin').hidden)open('applications');}
      }catch(_){/* Server remains the authority. */}
    }
  });
  window.addEventListener('hashchange',()=>{
    const target=location.hash.slice(1);
    if(valid.has(target))open(target);
  });
})();
