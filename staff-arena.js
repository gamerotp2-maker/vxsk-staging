/* VXSK V12.8.21 | Private tournament operations (existing STAGING Supabase schema).
   Requires the existing authenticated staff gate + MFA and RLS/RPC permissions.
   No service-role key or hidden permission upgrade in frontend code. */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const t=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=String(text??'');if(cls)e.className=cls;return e;};
  const state={api:null,referee:false,owner:false,editor:false,matches:[],ready:false,loading:false};
  const cover=window.VXSKCover;
  const eventPreview=cover?.preview(document.querySelector('[name=event-cover]'),$('staff-event-cover-preview'));
  const matchPreview=cover?.preview(document.querySelector('[name=match-cover]'),$('staff-match-cover-preview'));
  function notice(message='',error=false){const node=$('staff-arena-message');node.textContent=message;node.className='notice'+(error?' error':'');}
  const readable=date=>{if(!date)return 'TIME TBA';const d=new Date(date);return isNaN(d.valueOf())?'TIME TBA':new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Tunis'}).format(d)+' Tunis';};
  function submitBusy(form,disabled){const b=form.querySelector('button[type="submit"]');if(b)b.disabled=disabled;}
  const matchName=m=>m.game+' · '+m.side_a+' vs '+m.side_b;
  async function rpc(name,args){
    const {data,error}=await state.api.rpc(name,args);
    if(error)throw error;
    return data===true;
  }
  function showError(context,error){
    console.warn('VXSK STAGING tournament:',context,error?.code||error?.message||'error');
    notice(context+' failed. Check staging permissions, MFA and the Arena Hub database migration.',true);
  }
  async function getMatches(){
    const {data,error}=await state.api.from('vxsk_hub_matches')
      .select('id,game,side_a,side_b,round_name,bracket_slot,starts_at,state,published,created_at')
      .order('created_at',{ascending:false}).limit(120);
    if(error)throw error;
    // The editor's / owner's RLS allows unpublished drafts; no draft is sent to public pages.
    state.matches=data||[];
    const assign=$('staff-assign-match');assign.replaceChildren();
    const referee=$('staff-report-match');referee.replaceChildren();
    for(const m of state.matches){
      if(m.state==='cancelled')continue;
      if(state.owner){const opt=t('option',(m.published?'PUBLISHED':'DRAFT / PRIVATE')+' — '+matchName(m));opt.value=m.id;assign.append(opt);}
      if(state.referee&&m.published){const opt=t('option',matchName(m));opt.value=m.id;referee.append(opt);}
    }
    if(state.owner&&!assign.children.length){const opt=t('option','No matches available');opt.value='';opt.disabled=true;assign.append(opt);}
    if(state.referee&&!referee.children.length){const opt=t('option','Publish a match before reporting');opt.value='';opt.disabled=true;referee.append(opt);}
    $('staff-referee-form').querySelector('button[type="submit"]').disabled=!referee.children.length||!referee.value;
    const fixtures=$('staff-fixture-list');fixtures.replaceChildren();
    let readiness=new Map();
    if(state.referee){
      const {data:assignments,error:readyError}=await state.api.from('vxsk_hub_match_players').select('match_id,is_ready').limit(1000);
      if(!readyError)for(const a of assignments||[]){const count=readiness.get(a.match_id)||{ready:0,total:0};count.total++;if(a.is_ready)count.ready++;readiness.set(a.match_id,count);}
    }
    for(const m of state.matches.slice(0,30)){
      const row=t('div','','staff-arena-item');
      const check=readiness.get(m.id);
      row.append(t('strong',matchName(m)),t('small',(m.published?'PUBLISHED':'DRAFT / PRIVATE')+' · '+m.round_name+' · Slot '+m.bracket_slot+' · '+readable(m.starts_at)+(check?' · READY '+check.ready+'/'+check.total:' · NO ASSIGNED PLAYERS')));
      fixtures.append(row);
    }
    if(!fixtures.children.length)fixtures.append(t('p','No tournament fixtures yet.'));
  }
  async function getPlayers(){
    if(!state.owner)return;
    const {data,error}=await state.api.rpc('vxsk_staff_player_directory');if(error)throw error;
    for(const id of ['staff-assign-player','staff-badge-player']){
      const select=$(id);select.replaceChildren();
      const first=t('option','CHOOSE PLAYER');first.value='';select.append(first);
      for(const player of data||[]){
        const opt=t('option',player.nickname||'VXSK PLAYER');opt.value=player.user_id;select.append(opt);
      }
    }
  }
  async function getReports(){
    if(!state.referee)return;
    const queue=$('staff-report-queue');queue.replaceChildren(t('p','Loading referee reports…'));
    const {data,error}=await state.api.from('vxsk_hub_match_reports')
      .select('id,match_id,proposed_score_a,proposed_score_b,state,created_at,notes')
      .order('created_at',{ascending:false}).limit(50);
    if(error)throw error;
    queue.replaceChildren();
    for(const report of data||[]){
      const m=state.matches.find(row=>row.id===report.match_id);
      const card=t('article','','staff-arena-item');
      card.append(t('strong',m?matchName(m):'Match not in current list'),
        t('small','SCORE '+report.proposed_score_a+' : '+report.proposed_score_b+' · '+String(report.state).toUpperCase()+' · '+readable(report.created_at)));
      if(report.notes)card.append(t('p',report.notes));
      if(state.owner&&report.state==='pending'){
        const controls=t('div','','staff-arena-actions');
        for(const [label,approve] of [['APPROVE & PUBLISH',true],['REJECT',false]]){
          const button=t('button',label);button.type='button';
          button.addEventListener('click',async()=>{
            if(!confirm((approve?'Approve and publish':'Reject')+' this referee report?'))return;
            button.disabled=true;
            try{
              const ok=await rpc('vxsk_hub_owner_decide_report',{p_report:report.id,p_approve:approve});
              if(!ok)throw new Error('Not authorized');
              notice(approve?'Score approved and published by Owner.':'Referee report rejected.');
              await Promise.all([getMatches(),getReports()]);
            }catch(err){showError('Score decision',err);}finally{button.disabled=false;}
          });controls.append(button);
        }card.append(controls);
      }
      queue.append(card);
    }
    if(!queue.children.length)queue.append(t('p','No referee reports yet.'));
  }
  async function refresh(){
    if(!state.ready||state.loading)return;
    state.loading=true;$('staff-arena-refresh').disabled=true;
    try{
      await getMatches();await getReports();await getPlayers();
      notice('Tournament workspace connected. Draft matches stay private.');
    }catch(error){showError('Loading tournament data',error);}
    finally{state.loading=false;$('staff-arena-refresh').disabled=false;}
  }
  function bindForm(id,handler){
    $(id).addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget;
      if(!form.reportValidity())return;
      submitBusy(form,true);
      try{await handler(form);}catch(err){showError('Saving tournament action',err);}
      finally{submitBusy(form,false);}
    });
  }
  bindForm('staff-event-form',async f=>{
    if(!state.editor)return;
    const local=f.elements['event-date'].value;
    let path='';try{
      if(f.elements['event-cover'].files?.[0]){if(!cover)throw Error('Image tools unavailable');path=await cover.upload(state.api,f.elements['event-cover'].files[0]);}
      const payload={title:f.elements['event-title'].value.trim(),game:f.elements['event-game'].value,
        starts_at:new Date(local+':00+01:00').toISOString(),details:f.elements['event-details'].value.trim(),prize:f.elements['event-prize'].value.trim(),
        published:f.elements['event-publish'].checked};if(path)payload.cover_path=path;
      const {error}=await state.api.from('vxsk_hub_events').insert(payload);if(error)throw error;
      f.reset();eventPreview?.reset();notice('Tournament event saved with its chosen poster.');
    }catch(error){if(path)void cover?.discard(state.api,path);throw error;}
  });
  bindForm('staff-match-form',async f=>{
    if(!state.editor)return;
    const local=f.elements['match-date'].value;
    let path='';try{
      if(f.elements['match-cover'].files?.[0]){if(!cover)throw Error('Image tools unavailable');path=await cover.upload(state.api,f.elements['match-cover'].files[0]);}
      const payload={game:f.elements['match-game'].value,round_name:f.elements['match-round'].value.trim(),
        bracket_slot:Number(f.elements['match-slot'].value),side_a:f.elements['match-a'].value.trim(),side_b:f.elements['match-b'].value.trim(),
        starts_at:local?new Date(local+':00+01:00').toISOString():null,published:f.elements['match-publish'].checked};if(path)payload.cover_path=path;
      const {error}=await state.api.from('vxsk_hub_matches').insert(payload);if(error)throw error;
      f.reset();matchPreview?.reset();await refresh();notice('Bracket match saved. Drafts stay private.');
    }catch(error){if(path)void cover?.discard(state.api,path);throw error;}
  });
  bindForm('staff-referee-form',async f=>{
    if(!state.referee)return;
    const ok=await rpc('vxsk_hub_referee_report',{
      p_match:f.elements['report-match'].value,p_a:Number(f.elements['report-a'].value),
      p_b:Number(f.elements['report-b'].value),p_notes:f.elements['report-notes'].value
    });
    if(!ok)throw new Error('Referee report rejected');
    f.reset();await getReports();notice('Score proposal sent. Owner approval required.');
  });
  bindForm('staff-assign-form',async f=>{
    if(!state.owner)return;
    const ok=await rpc('vxsk_hub_owner_assign_player',{
      p_match:f.elements['assign-match'].value,p_player:f.elements['assign-user'].value.trim(),p_side:f.elements['assign-side'].value
    });
    if(!ok)throw new Error('Assignment denied');
    f.reset();notice('Player assigned and notified.');
  });
  bindForm('staff-badge-form',async f=>{
    if(!state.owner)return;
    const ok=await rpc('vxsk_hub_award_badge',{
      p_player:f.elements['badge-user'].value.trim(),p_badge:f.elements['badge-type'].value
    });
    if(!ok)throw new Error('Badge award denied');
    f.reset();notice('Badge awarded.');
  });
  $('staff-arena-refresh').addEventListener('click',refresh);
  window.addEventListener('vxsk:staff-tournaments-open',()=>void refresh());
  window.addEventListener('vxsk:staff-ready',async({detail})=>{
    const api=window.VXSK_STAFF_API;
    if(!api||!['owner','reviewer','staff'].includes(detail?.role))return;
    state.api=api;
    try{
      const {data:level,error:levelError}=await api.auth.mfa.getAuthenticatorAssuranceLevel();
      if(levelError||level?.currentLevel!=='aal2')throw new Error('MFA required');
      const [referee,owner,editor]=await Promise.all([
        api.rpc('vxsk_hub_referee'),api.rpc('vxsk_hub_owner'),api.rpc('vxsk_hub_editor')
      ]);
      state.referee=!referee.error&&referee.data===true;
      state.owner=!owner.error&&owner.data===true;
      state.editor=!editor.error&&editor.data===true;
      $('staff-arena-referee-area').hidden=!state.referee;
      $('staff-arena-owner-area').hidden=!state.owner;
      $('staff-arena-editor-area').hidden=!state.editor;
      $('staff-arena-noaccess').hidden=state.referee||state.editor||state.owner;
      $('staff-arena-role-note').textContent=state.owner?'OWNER / MFA VERIFIED':state.referee?'REFEREE / MFA VERIFIED':state.editor?'EDITOR / MFA VERIFIED':'STAFF / LIMITED TOURNAMENT ACCESS';
      state.ready=true;
      if(!document.getElementById('staff-view-tournaments').hidden)void refresh();
      else notice('Tournament controls ready. Open this tab to load current matches.');
    }catch(error){showError('Verifying tournament access',error);}
  });
})();
