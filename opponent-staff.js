/* VXSK separate private No Opponent? request inbox. Server enforces authorization. */
'use strict';
(() => {
  const $ = sel => document.querySelector(sel);
  const container=$('#opponent-requests-list');
  if(!container)return;
  let api, role, loading=false;
  const el=(tag,txt,cls='')=>{
    const node=document.createElement(tag);node.textContent=String(txt??'');
    if(cls)node.className=cls;
    return node;
  };
  const notice=(value,type='')=>{
    $('#opponent-notice').textContent=value;
    $('#opponent-notice').className='notice '+type;
  };
  const readable=value=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  const keys={game:'Game',mode:'Mode',playerUsername:'Player',rank:'Rank',region:'Region',privateContact:'Private contact',availability:'Preferred time',email:'Account email'};
  async function load(){
    if(!api||!['owner','reviewer'].includes(role)||loading)return;
    loading=true;notice('Loading private opponent requests…');
    try{
      const {data,error}=await api.from('opponent_requests')
        .select('id,submitted_at,status,form_data').order('submitted_at',{ascending:false}).limit(200);
      if(error)throw error;
      const requests=Array.isArray(data)?data:[];
      $('#opponents-inbox-count').textContent=String(requests.filter(x=>x.status==='pending').length);
      container.replaceChildren();
      if(!requests.length){container.append(el('p','No opponent requests yet.','muted'));notice('');return;}
      for(const row of requests){
        const card=el('article','','opponent-entry');
        const top=el('div','','opponent-entry-heading');
        top.append(el('strong',row.form_data?.playerUsername||'Player'),el('span',String(row.status||'pending').toUpperCase(),'status '+row.status));
        card.append(top,el('small',readable(row.submitted_at)+' · Ref '+String(row.id).slice(0,8),'entry-date'));
        const dl=el('dl','','data-fields');
        for(const [key,label] of Object.entries(keys)){
          const v=row.form_data?.[key];if(!v)continue;
          const wrapper=el('div');wrapper.append(el('dt',label),el('dd',String(v).slice(0,150)));dl.append(wrapper);
        }
        card.append(dl);
        const actions=el('div','','opponent-entry-actions');
        for(const [value,label] of [['reviewed','MARK REVIEWED'],['matched','MARK MATCHED'],['closed','CLOSE REQUEST']]){
          if(row.status==='closed'||row.status==='matched')break;
          const button=el('button',label);button.type='button';
          button.addEventListener('click',async()=>{
            if(!confirm(`Change this opponent request to ${value.toUpperCase()}?`))return;
            button.disabled=true;
            try{
              const {data:ok,error:updateError}=await api.rpc('resolve_opponent_request',{p_request_id:row.id,p_action:value});
              if(updateError||ok!==true)throw new Error('Request not accepted by Supabase.');
              notice('Opponent request updated.','success');loading=false;await load();
            }catch(_){notice('Could not update. Check your reviewer role, 2FA and staging migration.','error');button.disabled=false;}
          });
          actions.append(button);
        }
        // Reviewers (and owner) can permanently delete any No Opponent request.
        // The RPC validates actual role + aal2; not just the visible UI.
        const deleteButton=el('button','DELETE REQUEST','opponent-delete');
        deleteButton.type='button';
        deleteButton.setAttribute('aria-label',`Permanently delete opponent request for ${row.form_data?.playerUsername||'player'}`);
        deleteButton.addEventListener('click',async()=>{
          if(!window.confirm(`Permanently delete the No Opponent request for ${row.form_data?.playerUsername||'this player'}? It will disappear from Staff Panel and the player’s My Account. This cannot be undone.`))return;
          if(window.prompt('Type DELETE to permanently remove this request:')!=='DELETE')return;
          deleteButton.disabled=true;deleteButton.textContent='DELETING…';
          try{
            const {data:deleted,error:deleteError}=await api.rpc('delete_opponent_request',{p_request_id:row.id});
            if(deleteError)throw deleteError;
            if(deleted!==true)throw new Error('Deletion was not accepted. Check 2FA or role permissions.');
            notice('Opponent request permanently deleted.','success');
            await load();
          }catch(error){
            notice(error?.message||'Could not delete this request.','error');
            deleteButton.disabled=false;deleteButton.textContent='DELETE REQUEST';
          }
        });
        actions.append(deleteButton);
        card.append(actions);container.append(card);
      }
      notice(requests.length===200?'Showing newest 200 requests; pagination needed for older records.':'');
    }catch(_){container.replaceChildren(el('p','Opponent inbox is unavailable. Install the staging SQL migration before testing; Netlify Forms is not connected to this inbox.','muted'));notice('Opponent inbox query could not complete.','error');}
    finally{loading=false;}
  }
  window.addEventListener('vxsk:staff-ready',event=>{
    role=event.detail?.role;api=window.VXSK_STAFF_API;
    if(!['owner','reviewer'].includes(role)){
      $('#staff-inbox-opponents').hidden=true;
      return;
    }
    load();
  });
  window.addEventListener('vxsk:opponent-inbox-open',load);
  $('#opponent-refresh')?.addEventListener('click',load);
})();
