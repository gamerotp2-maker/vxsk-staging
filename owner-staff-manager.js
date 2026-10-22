/* VXSK V12.8.29 — Owner-only staff roles UX. Authority remains exclusively in Supabase RPCs. */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const panel=$('staff-view-team'), tab=$('staff-owner-team-tab');
  if(!panel||!tab)return;
  let ready=false, loading=false, lastQuery='', debounceId=null;
  const roles={none:'PLAYER · NO ROLE',reviewer:'REVIEWER · APPROVE / REJECT',staff:'STAFF · VIEW / NOTES',owner:'OWNER · PROTECTED'};
  const show=(msg,kind='')=>{const el=$('owner-team-feedback');el.textContent=msg;el.className='notice'+(kind?' '+kind:'');};
  const elem=(tag,text,className)=>{const n=document.createElement(tag);n.textContent=String(text??'');if(className)n.className=className;return n;};
  const api=()=>window.VXSK_STAFF_API;
  function describe(error){
    const message=String(error?.message||'Could not reach Supabase.');
    if(/does not exist|not found|schema cache|PGRST202|42883/i.test(message))return 'Install the V12.8.29 Owner Staff Manager SQL in Supabase STAGING, then refresh this page.';
    if(/Owner and 2FA|42501|permission denied/i.test(message))return 'Owner permission + 2FA verification required. Reopen Staff Command after login.';
    return message.slice(0,280);
  }
  async function call(name,args){
    const db=api();if(!db)throw Error('Staff session unavailable. Refresh the Staff Command.');
    const {data,error}=await db.rpc(name,args);
    if(error)throw error;
    return data;
  }
  function mkRow(row,context){
    const nick=String(row.nickname||'VXSK user');
    const role=String(row.current_role||'none');
    const card=elem('div','', 'owner-team-member'+(role==='owner'?' owner-team-member-owner':''));
    const name=document.createElement('div');name.className='owner-team-name';
    name.append(elem('strong',nick),elem('small',role==='owner'?'👑 OWNER — PROTECTED':roles[role]||'PLAYER'));
    card.append(name);
    if(role==='owner')return card;
    const controls=document.createElement('div');controls.className='owner-team-apply';
    const select=document.createElement('select');select.setAttribute('aria-label','Role for '+nick);
    select.dataset.targetId=String(row.user_id||'');
    for(const key of ['none','reviewer','staff']){
      const opt=document.createElement('option');opt.value=key;opt.textContent=roles[key];select.append(opt);
    }
    select.value=role in roles?role:'none';
    const startRole=select.value;
    const btn=elem('button', 'SAVE ROLE ↗');btn.type='button';btn.disabled=true;
    select.addEventListener('change',()=>{btn.disabled=select.value===startRole;});
    btn.addEventListener('click',async()=>{
      if(!ready||loading||!select.dataset.targetId)return;
      const next=select.value;
      if(next===startRole)return;
      const message=next==='none'?'REMOVE staff access from '+nick+'?': 'Give '+nick+' the '+next.toUpperCase()+' role?';
      if(!window.confirm(message))return;
      loading=true;btn.disabled=true;select.disabled=true;show('Updating '+nick+'…');
      try{
        const saved=await call('vxsk_owner_staff_set',{p_target:select.dataset.targetId,p_role:next});
        if(saved!==next)throw Error('Supabase did not confirm the requested role.');
        show(nick+': role changed to '+(next==='none'?'PLAYER':next.toUpperCase())+'.','success');
        await Promise.all([loadTeam(),loadHistory(),lastQuery?search(lastQuery):Promise.resolve()]);
      }catch(err){show(describe(err),'error');select.disabled=false;btn.disabled=false;}
      finally{loading=false;}
    });
    controls.append(select,btn);card.append(controls);
    return card;
  }
  function fillResults(target,items,empty,context){
    target.replaceChildren();
    if(!items?.length){target.append(elem('p',empty,'small-muted'));return;}
    for(const item of items)target.append(mkRow(item,context));
  }
  async function loadTeam(){
    const items=await call('vxsk_owner_staff_list');
    const assigned=Array.isArray(items)?items:[];
    $('owner-team-count').textContent=String(assigned.length);
    fillResults($('owner-team-members'),assigned,'No staff assignments found.','team');
  }
  async function loadHistory(){
    const history=await call('vxsk_owner_staff_history');
    const target=$('owner-team-history');target.replaceChildren();
    if(!Array.isArray(history)||!history.length){target.append(elem('p','No role changes through this manager yet.'));return;}
    for(const change of history){
      const entry=elem('div','', 'owner-team-history-entry');
      entry.append(elem('strong',(change.target_nickname||'VXSK user')+' · '+String(change.previous_role||'player').toUpperCase()+' → '+String(change.new_role||'player').toUpperCase()));
      const d=new Date(change.changed_at);entry.append(elem('small',Number.isNaN(d.getTime())?'—':d.toLocaleString()));
      target.append(entry);
    }
  }
  async function search(query){
    const q=String(query||'').trim();lastQuery=q;
    const target=$('owner-team-search-results');
    if(q.length<2){fillResults(target,[],'Enter at least 2 characters.','search');return;}
    target.replaceChildren(elem('p','Searching…','small-muted'));
    try{
      const found=await call('vxsk_owner_staff_search',{p_query:q});
      if(lastQuery!==q)return;
      fillResults(target,found,'No verified VXSK account with this nickname.','search');
    }catch(err){if(lastQuery===q){fillResults(target,[],describe(err),'search');show(describe(err),'error');}}
  }
  async function open(){
    if(!ready||panel.hidden)return;
    try{
      await Promise.all([loadTeam(),loadHistory()]);
    }catch(err){show(describe(err),'error');}
  }
  $('owner-team-refresh').addEventListener('click',open);
  $('owner-team-search-form').addEventListener('submit',event=>{event.preventDefault();void search($('owner-team-search').value);});
  $('owner-team-search').addEventListener('input',()=>{
    clearTimeout(debounceId);
    const q=$('owner-team-search').value.trim();
    if(q.length<2){void search(q);return;}
    debounceId=setTimeout(()=>void search(q),350);
  });
  window.addEventListener('vxsk:staff-ready',event=>{
    ready=event.detail?.role==='owner';
    if(!ready){tab.hidden=true;panel.hidden=true;return;}
    if(!panel.hidden)void open();
  });
  window.addEventListener('vxsk:owner-team-open',()=>{if(ready)void open();});
})();
