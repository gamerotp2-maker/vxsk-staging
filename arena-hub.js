/* VXSK ARENA HUB V12.8.18 — staging only. No secrets, privileged keys or public identities. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.VXSK_SUPABASE || {};
  const gameNames = ['Rocket League','VALORANT','League of Legends'];
  const storageGet=(key)=>{try{return localStorage.getItem(key);}catch(_){return null;}};
  const storageSet=(key,val)=>{try{localStorage.setItem(key,val);}catch(_){}};
  const state = {api:null,user:null,events:[],matches:[],teams:[],mine:[],members:[],referee:false,owner:false,editor:false,notices:[]};
  const el = (tag, text='', className='') => {
    const n=document.createElement(tag);n.textContent=String(text ?? '');if(className)n.className=className;return n;
  };
  const info = (value,kind='') => {const node=$('arena-alert');if(!node)return;node.textContent=value;node.dataset.kind=kind;};
  const empty=(msg)=>el('div',msg,'empty');
  const dateText=(date)=>{if(!date)return 'TIME TBA';const d=new Date(date);return Number.isNaN(d.valueOf())?'TIME TBA':new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Tunis',dateStyle:'medium',timeStyle:'short'}).format(d)+' (Tunis)';};
  const makeButton=(text,fn)=>{const b=el('button',text);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){info('Could not complete this action. Try again.','error');console.warn('Arena action:',e?.message||'error');}finally{b.disabled=false;}});return b;};
  const card=(heading,game,status,desc)=>{const c=el('article','','arena-item');const meta=el('div','','arena-meta');if(game)meta.append(el('span',game,'arena-tag'));if(status)meta.append(el('span',status.toUpperCase(),'arena-tag status-'+status.toLowerCase()));c.append(meta,el('h3',heading));if(desc)c.append(el('p',desc));return c;};
  const handleError=(error,context)=>{if(error){console.warn('Arena',context,error.code||'unavailable');if(['42P01','PGRST205','42883'].includes(error.code)||/schema cache|does not exist/i.test(error.message||'')){info('Arena Hub database migration is not installed in VXSK-STAGING yet. See the separate SQL setup instructions. No private data was changed.','error');}else info('Some arena features are unavailable right now. Check the staging database setup.','error');}return Boolean(error);};
  async function rpc(name,args={}) {
    if(!state.user){info('Sign in on the VXSK website before using player features.','error');return null;}
    const {data,error}=await state.api.rpc(name,args);
    if(handleError(error,name))return null;
    return data;
  }
  function show(tab){
    document.querySelectorAll('[data-arena-tab]').forEach(b=>{const on=b.dataset.arenaTab===tab;b.classList.toggle('selected',on);b.setAttribute('aria-selected',String(on));});
    document.querySelectorAll('[data-arena-panel]').forEach(p=>{p.hidden=p.dataset.arenaPanel!==tab;});
    if(tab==='referee')void renderReferee();
  }
  document.querySelectorAll('[data-arena-tab]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.arenaTab)));
  function renderMatches(){
    const box=$('arena-match-list');box.replaceChildren();const filter=$('arena-game-filter').value;
    const matches=state.matches.filter(m=>filter==='all'||m.game===filter).sort((a,b)=>{
      const done=m=>m.state==='completed'||m.state==='cancelled'?1:0;
      return done(a)-done(b)||new Date(a.starts_at||'2100-01-01')-new Date(b.starts_at||'2100-01-01');
    });
    if(!matches.length){box.append(empty('No matches published yet. Official fixtures will appear when staff schedule them.'));return;}
    for(const m of matches){
      const c=card(m.round_name,m.game,m.state,dateText(m.starts_at));
      const score = m.score_a==null||m.score_b==null?'VS':`${m.score_a} – ${m.score_b}`;
      const names=el('div','','arena-competitors');names.append(el('strong',m.side_a),el('span',score),el('strong',m.side_b));c.append(names);box.append(c);
    }
  }
  function renderCalendar(){
    const box=$('arena-event-list');box.replaceChildren();
    for(const evt of [...state.events].sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).slice(0,35)){
      const c=card(evt.title,evt.game,'',dateText(evt.starts_at));if(evt.details)c.append(el('p',evt.details));box.append(c);
    }
    if(!box.children.length)box.append(empty('No published event calendar dates yet.'));
  }
  function renderBrackets(){
    const box=$('arena-bracket');box.replaceChildren();
    const game=$('arena-bracket-game').value;
    const matches=state.matches.filter(m=>m.game===game).sort((a,b)=>a.bracket_slot-b.bracket_slot);
    if(!matches.length){box.append(empty('No '+game+' bracket published yet.'));return;}
    const rounds=new Map();for(const m of matches){if(!rounds.has(m.round_name))rounds.set(m.round_name,[]);rounds.get(m.round_name).push(m);}
    for(const [round,items] of rounds){const col=el('section','','arena-round');col.append(el('h3',round));for(const m of items){const score=m.score_a!=null&&m.score_b!=null?` · ${m.score_a} : ${m.score_b}`:'';const c=card(m.side_a+'  VS  '+m.side_b,m.game,m.state,'Slot '+m.bracket_slot+score);col.append(c);}box.append(col);}
  }
  async function renderTeams(){
    const box=$('arena-team-list');box.replaceChildren();
    if(!state.teams.length){box.append(empty('No teams listed yet. Be the first to start one!'));}
    for(const t of state.teams){
      const c=card(t.name,t.game,'',t.description||'VXSK squad');
      const roster=el('p','Loading privacy-safe roster…','arena-roster');c.append(roster);
      if(state.user){c.append(makeButton('REQUEST TO JOIN',async()=>{if(await rpc('vxsk_hub_join_team',{p_team:t.id})){info('Request sent! The team captain can accept it.','ok');await loadPersonal();}else info('Unable to join. You may already be a member or this team is full.','error');}));}
      c.append(makeButton('VIEW ROSTER',async()=>{
        const {data,error}=await state.api.rpc('vxsk_hub_team_roster',{p_team:t.id});
        roster.textContent=error?'Roster not available':Array.isArray(data)&&data.length?data.join(' · '):'No public player names yet';
      }));
      roster.textContent='Click View Roster to load consenting player nicknames.';
      box.append(c);
    }
    renderMyTeams();
  }
  function renderMyTeams(){
    const box=$('arena-my-teams');box.replaceChildren(el('h3','MY TEAMS & REQUESTS'));
    if(!state.user){box.append(el('p','Sign in on the main website.'));return;}
    const myTeams=state.teams.filter(t=>t.captain_id===state.user.id);
    const myMemberships=state.members.filter(m=>m.user_id===state.user.id);
    if(!myTeams.length&&!myMemberships.length){box.append(el('p','You have no team memberships yet.'));return;}
    for(const t of myTeams){
      box.append(el('p','CAPTAIN · '+t.name));
      for(const m of state.members.filter(m=>m.team_id===t.id&&m.state==='pending')){
        const line=el('div','Join request · user '+m.user_id.slice(0,8)+'…','arena-item');
        line.append(makeButton('ACCEPT',async()=>{if(await rpc('vxsk_hub_team_decide',{p_team:t.id,p_member:m.user_id,p_accept:true})){info('Team request accepted.','ok');await loadPersonal();}}));
        line.append(makeButton('DECLINE',async()=>{if(await rpc('vxsk_hub_team_decide',{p_team:t.id,p_member:m.user_id,p_accept:false})){info('Request declined.','ok');await loadPersonal();}}));box.append(line);
      }
    }
    for(const m of myMemberships){
      const t=state.teams.find(t=>t.id===m.team_id);if(!t||t.captain_id===state.user.id)continue;
      const line=el('p',(t?.name||'Team')+' · '+m.state.toUpperCase());
      line.append(makeButton('LEAVE / CANCEL REQUEST',async()=>{if(await rpc('vxsk_hub_leave_team',{p_team:m.team_id})){await loadPersonal();info('Membership/request removed.','ok');}}));box.append(line);
    }
  }
  function renderPersonal(){
    const stats=$('arena-my-stats'),ready=$('arena-ready-list');stats.replaceChildren();ready.replaceChildren();
    if(!state.user){stats.append(el('p','Sign in to check your matches and badges.'));$('arena-notices').textContent='Sign in to view private notifications.';return;}
    const assigned=state.mine;
    const result={played:0,wins:0,losses:0,draws:0};
    for(const assignment of assigned){
      const m=state.matches.find(x=>x.id===assignment.match_id);
      if(!m)continue;
      if(m.state==='completed'&&m.score_a!=null&&m.score_b!=null){result.played++;
        const my=assignment.side==='A'?m.score_a:m.score_b;
        const opp=assignment.side==='A'?m.score_b:m.score_a;
        if(my>opp)result.wins++;else if(my<opp)result.losses++;else result.draws++;
      }
      const c=card(m.side_a+' vs '+m.side_b,m.game,m.state,dateText(m.starts_at));
      c.append(el('p',assignment.is_ready?'✓ YOU ARE READY':'You are not marked ready yet'));
      if(m.state==='scheduled')c.append(makeButton(assignment.is_ready?'CANCEL READY':'I AM READY ✓',async()=>{
        if(await rpc('vxsk_hub_ready',{p_match:m.id,p_ready:!assignment.is_ready})){await loadPersonal();info('Ready status updated.','ok');}
      }));ready.append(c);
    }
    if(!ready.children.length)ready.append(empty('No assigned matches yet. Only event staff can assign a player to a match.'));
    for(const [name,num] of [['PLAYED',result.played],['WINS',result.wins],['LOSSES',result.losses],['DRAWS',result.draws]]){const n=el('span');n.append(el('strong',num),el('small',name));stats.append(n);}
    const badges=$('arena-badges');badges.replaceChildren();if(!state.badges?.length)badges.append(el('p','No badges awarded yet.'));
    else state.badges.forEach(b=>badges.append(el('span','✦ '+b.badge+'  ','arena-tag')));
    if(state.status){
      const form=$('arena-status-form');form.elements['activity-game'].value=state.status.game||'';
      form.elements['activity-state'].value=state.status.activity;
      form.elements['activity-public'].checked=Boolean(state.status.visible);
    }
    renderNotices();
  }
  function renderNotices(){
    const box=$('arena-notices');box.replaceChildren();const unread=state.notices.filter(n=>!n.seen).length;
    $('arena-notice-count').textContent=unread?`(${unread})`:'';
    if(!state.notices.length){box.append(empty('No notifications yet.'));return;}
    for(const n of state.notices){
      const c=card(n.body,'',n.seen?'seen':'new',dateText(n.created_at));
      if(!n.seen)c.append(makeButton('MARK READ ✓',async()=>{const {error}=await state.api.from('vxsk_hub_notifications').update({seen:true}).eq('id',n.id).eq('user_id',state.user.id);if(!handleError(error,'mark read'))await loadPersonal();}));box.append(c);
    }
  }
  async function renderReferee(){
    const gate=$('arena-referee-gate');const form=$('arena-referee-form');const queue=$('arena-report-queue');
    form.hidden=!state.referee;queue.replaceChildren();
    $('arena-editor-workspace').hidden=!state.editor;
    $('arena-owner-tools').hidden=!state.owner;
    const selectable = state.matches.filter(m=>m.state!=='cancelled');
    for(const id of ['arena-assign-match']){const drop=$(id);drop.replaceChildren();for(const m of selectable){const option=el('option',m.game+' · '+m.side_a+' vs '+m.side_b);option.value=m.id;drop.append(option);}}
    if(!state.referee){gate.textContent='Verified VXSK staff with authenticator 2FA only. You can sign in on the main website.';queue.append(el('p','Referee reports are private.'));return;}
    gate.textContent=state.owner?'OWNER · You can review and approve reports.':'VERIFIED REFEREE · You can submit proposed scores.';
    const matchSelect=$('arena-report-match');matchSelect.replaceChildren();
    const options=state.matches.filter(m=>m.state!=='cancelled');
    for(const m of options){const opt=el('option',m.game+' · '+m.side_a+' vs '+m.side_b);opt.value=m.id;matchSelect.append(opt);}
    if(!options.length){form.hidden=true;queue.append(empty('Staff must publish matches before referees can report scores.'));}
    const {data,error}=await state.api.from('vxsk_hub_match_reports').select('id,match_id,proposed_score_a,proposed_score_b,state,created_at,notes').order('created_at',{ascending:false}).limit(50);
    if(handleError(error,'referee queue'))return;
    for(const r of data||[]){const m=state.matches.find(m=>m.id===r.match_id);const c=card(m?m.side_a+' vs '+m.side_b:'Unpublished match','',r.state,`${r.proposed_score_a} : ${r.proposed_score_b} · ${dateText(r.created_at)}`);if(r.notes)c.append(el('p',r.notes));
      if(state.owner&&r.state==='pending'){
        c.append(makeButton('APPROVE & PUBLISH',async()=>{if(!confirm('Publish this report and update the official match score?'))return;if(await rpc('vxsk_hub_owner_decide_report',{p_report:r.id,p_approve:true})){await loadPublic();await renderReferee();info('Match score published by owner.','ok');}}));
        c.append(makeButton('REJECT',async()=>{if(!confirm('Reject this referee report?'))return;if(await rpc('vxsk_hub_owner_decide_report',{p_report:r.id,p_approve:false})){await renderReferee();info('Report rejected by owner.','ok');}}));
      }
      queue.append(c);
    }
    if(!queue.children.length)queue.append(empty('No referee reports submitted yet.'));
  }
  async function loadPublic(){
    const [events,matches,teams,announcements] = await Promise.all([
      state.api.from('vxsk_hub_events').select('id,title,game,starts_at,details,published').eq('published',true).order('starts_at',{ascending:true}).limit(80),
      state.api.from('vxsk_hub_matches').select('id,event_id,game,round_name,bracket_slot,side_a,side_b,starts_at,state,score_a,score_b,published').eq('published',true).limit(120),
      state.api.from('vxsk_hub_teams').select('id,captain_id,name,game,description,published').eq('published',true).limit(60),
      state.api.from('match_center_posts').select('title,body,created_at').eq('kind','announcement').eq('published',true).order('created_at',{ascending:false}).limit(8)
    ]);
    for(const response of [events,matches,teams])if(handleError(response.error,'public feed'))break;
    state.events=events.data||[];state.matches=matches.data||[];state.teams=teams.data||[];
    $('arena-events-count').textContent=state.events.length;
    $('arena-matches-count').textContent=state.matches.length;
    $('arena-teams-count').textContent=state.teams.length;
    const box=$('arena-announcements');box.replaceChildren();
    for(const a of announcements.data||[]){const item=el('p');item.append(el('strong',a.title+' · '),el('span',a.body||''));box.append(item);}
    if(!box.children.length)box.append(el('p','No official announcements published yet.'));
    renderMatches();renderCalendar();renderBrackets();void renderTeams();
  }
  async function loadPersonal(){
    if(!state.user){renderPersonal();return;}
    const uid=state.user.id;
    const reqs=await Promise.all([
      state.api.from('vxsk_hub_match_players').select('match_id,side,is_ready,ready_at').eq('user_id',uid).limit(100),
      state.api.from('vxsk_hub_team_members').select('team_id,user_id,state,requested_at').limit(120),
      state.api.from('vxsk_hub_notifications').select('id,body,href,seen,created_at').order('created_at',{ascending:false}).limit(50),
      state.api.from('vxsk_hub_badges').select('badge,awarded_at').eq('user_id',uid).limit(20),
      state.api.from('vxsk_hub_status').select('game,activity,visible').eq('user_id',uid).maybeSingle()
    ]);
    const [mine,members,notices,badges,status]=reqs;
    for(const r of reqs){if(handleError(r.error,'player data'))break;}
    state.mine=mine.data||[];state.members=members.data||[];state.notices=notices.data||[];
    state.badges=badges.data||[];state.status=status.data||null;
    renderPersonal();renderMyTeams();
  }
  async function reload(){
    info('Refreshing VXSK Arena Hub…');
    const cfg=window.VXSK_SUPABASE||{};
    if(window.VXSK_STAGING_BLOCKED||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url||'')||!cfg.publishableKey){info('STAGING safety lock: check the Supabase public configuration.','error');return;}
    if(!window.supabase?.createClient){info('Supabase library could not load. Check your connection.','error');return;}
    if(!state.api){state.api=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});}
    const {data,error}=await state.api.auth.getUser();state.user=error?null:data?.user||null;
    $('arena-login').textContent=state.user?'ACCOUNT CONNECTED ✓':'SIGN IN ↗';
    if(state.user){const [referee,owner,editor]=await Promise.all([state.api.rpc('vxsk_hub_referee'),state.api.rpc('vxsk_hub_owner'),state.api.rpc('vxsk_hub_editor')]);state.referee=Boolean(referee.data&&!referee.error);state.owner=Boolean(owner.data&&!owner.error);state.editor=Boolean(editor.data&&!editor.error);}else{state.referee=false;state.owner=false;state.editor=false;state.badges=[];state.notices=[];}
    await loadPublic();await loadPersonal();
    info(state.user?'ARENA HUB CONNECTED · Logged in to VXSK-STAGING':'Viewing public Arena Hub. Sign in on VXSK to use personal features.','ok');
  }
  $('arena-refresh').addEventListener('click',()=>void reload());
  $('arena-game-filter').addEventListener('change',renderMatches);
  $('arena-bracket-game').addEventListener('change',renderBrackets);
  $('arena-team-create').addEventListener('submit',async e=>{
    e.preventDefault();const f=e.currentTarget;if(!state.user){info('Sign in first.','error');return;}
    const id=await rpc('vxsk_hub_create_team',{p_name:f.elements['team-name'].value,p_game:f.elements['team-game'].value,p_description:f.elements['team-description'].value});
    if(id){f.reset();await loadPublic();await loadPersonal();info('Your squad has been created!','ok');}else info('Team not created. Check its name and the 3-team limit.','error');
  });
  $('arena-status-form').addEventListener('submit',async e=>{
    e.preventDefault();const f=e.currentTarget;
    const ok=await rpc('vxsk_hub_set_status',{p_game:f.elements['activity-game'].value||null,p_activity:f.elements['activity-state'].value,p_visible:f.elements['activity-public'].checked});
    if(ok){await loadPersonal();info('Your status was saved.','ok');}else info('Status unchanged. You can update it once every 10 seconds.','error');
  });
  $('arena-safety-report').addEventListener('submit',async e=>{
    e.preventDefault();const f=e.currentTarget;
    const ok=await rpc('vxsk_hub_report',{p_category:f.elements.reason.value,p_details:f.elements.details.value});
    if(ok){f.reset();info('Your private report was submitted to the VXSK staff queue.','ok');}
    else info('Report not submitted. Check the length and hourly limit.','error');
  });
  $('arena-referee-form').addEventListener('submit',async e=>{
    e.preventDefault();const f=e.currentTarget;if(!state.referee){info('Referee access required.','error');return;}
    const ok=await rpc('vxsk_hub_referee_report',{p_match:f.elements['report-match'].value,p_a:Number(f.elements['report-a'].value),p_b:Number(f.elements['report-b'].value),p_notes:f.elements['report-notes'].value});
    if(ok){f.reset();await renderReferee();info('Report submitted. Only the owner can approve and publish it.','ok');}
  });
  // Writes rely on database RLS as well as the verified editor/owner role.
  $('arena-event-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!state.editor)return;const f=e.currentTarget;
    const time=f.elements['event-date'].value;
    const {error}=await state.api.from('vxsk_hub_events').insert({title:f.elements['event-title'].value.trim(),game:f.elements['event-game'].value,
      starts_at:new Date(time+':00+01:00').toISOString(),details:f.elements['event-details'].value.trim(),published:f.elements['event-publish'].checked});
    if(!handleError(error,'event create')){f.reset();await loadPublic();info('Event date saved in STAGING.','ok');}
  });
  $('arena-match-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!state.editor)return;const f=e.currentTarget;
    const time=f.elements['match-date'].value;
    const {error}=await state.api.from('vxsk_hub_matches').insert({game:f.elements['match-game'].value,round_name:f.elements['match-round'].value.trim(),
      bracket_slot:Number(f.elements['match-slot'].value),side_a:f.elements['match-a'].value.trim(),side_b:f.elements['match-b'].value.trim(),
      starts_at:time?new Date(time+':00+01:00').toISOString():null,published:f.elements['match-publish'].checked});
    if(!handleError(error,'match create')){f.reset();await loadPublic();await renderReferee();info('Bracket match saved in STAGING.','ok');}
  });
  $('arena-assign-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!state.owner)return;const f=e.currentTarget;
    const ok=await rpc('vxsk_hub_owner_assign_player',{p_match:f.elements['assign-match'].value,p_player:f.elements['assign-user'].value.trim(),p_side:f.elements['assign-side'].value});
    if(ok){f.reset();info('Player assigned and notified.','ok');}else info('Assignment not allowed. Verify UUID and match.','error');
  });
  $('arena-badge-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!state.owner)return;const f=e.currentTarget;
    const ok=await rpc('vxsk_hub_award_badge',{p_player:f.elements['badge-user'].value.trim(),p_badge:f.elements['badge-type'].value});
    if(ok){f.reset();info('Badge awarded.','ok');}else info('Unable to award badge. Verify user UUID.','error');
  });
  $('arena-low-lag').addEventListener('click',()=>{
    const next=!(storageGet('vxsk-low-lag')==='1');storageSet('vxsk-low-lag',next?'1':'0');document.body.classList.toggle('vxsk-low-lag',next);$('arena-low-lag').textContent=next?'TURN OFF LOW-LAG MODE':'TURN ON LOW-LAG MODE';
  });
  document.body.classList.toggle('vxsk-low-lag',storageGet('vxsk-low-lag')==='1');
  $('arena-low-lag').textContent=storageGet('vxsk-low-lag')==='1'?'TURN OFF LOW-LAG MODE':'TURN ON LOW-LAG MODE';
  let installPrompt=null;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('arena-install').hidden=false;});
  $('arena-install').addEventListener('click',async()=>{if(!installPrompt)return;const prompt=installPrompt;installPrompt=null;prompt.prompt();await prompt.userChoice;$('arena-install').hidden=true;});
  void reload();
})();
