/* VXSK V12.8.21 — one staff command dashboard, four focused views.
   These are navigation controls, never a substitute for Supabase authorization. */
'use strict';
(() => {
  const tabs=[...document.querySelectorAll('[data-staff-tab]')];
  const views=[...document.querySelectorAll('[data-staff-view]')];
  if(!tabs.length||!views.length)return;
  const valid=new Set(views.map(node=>node.dataset.staffView));
  function open(name){
    if(!valid.has(name))name='applications';
    if(document.querySelector('[data-staff-tab="'+name+'"]')?.hidden)name='applications';
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
    // Back/refresh should not silently open a hidden area.
    try{history.replaceState(null,'','#'+name);}catch(_){/* file preview */}
  }
  for(const button of tabs)button.addEventListener('click',()=>open(button.dataset.staffTab));
  window.addEventListener('vxsk:staff-ready',async({detail})=>{
    if(!['owner','reviewer'].includes(detail?.role)){
      const opp=document.querySelector('[data-staff-tab="opponents"]');
      if(opp)opp.hidden=true;
    }
    const chosen=location.hash.slice(1);
    open(valid.has(chosen)?chosen:'applications');
    // Hide unusable publishing navigation for accounts without the existing editor RPC.
    // This is only a UI convenience; Supabase continues to enforce real permissions.
    const api=window.VXSK_STAFF_API;
    if(api){
      try{
        const {data,error}=await api.rpc('can_edit_match_center');
        const bulletin=document.querySelector('[data-staff-tab="bulletin"]');
        if(bulletin&&(error||data!==true)){
          bulletin.hidden=true;
          if(!document.getElementById('staff-view-bulletin').hidden)open('applications');
        }
      }catch(_){/* Keep sensitive editing gated by its own RPC and RLS */}
    }
  });
  window.addEventListener('hashchange',()=>{
    const target=location.hash.slice(1);
    if(valid.has(target))open(target);
  });
})();
