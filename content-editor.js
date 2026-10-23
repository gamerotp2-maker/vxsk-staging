/* Authorized editor for VXSK public announcements + showmatches.
   Supabase RLS enforces write access: Owner or explicitly assigned editor, AND AAL2.
   The staff page UI does not grant any authorization. */
'use strict';
(async () => {
  const $ = selector => document.querySelector(selector);
  const cfg = window.VXSK_SUPABASE || {};
  const container = $('#content-editor');
  if (!container || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url||'') ||
    !cfg.publishableKey || cfg.publishableKey.includes('PASTE_') ||
    !window.supabase?.createClient) return;
  const api=window.VXSK_STAFF_API; // Reuse the same auth client as staff.js.
  if (!api) return;
  const {data:{user}={},error:userError} = await api.auth.getUser();
  if(userError || !user) return;
  const {data:level,error:levelError} = await api.auth.mfa.getAuthenticatorAssuranceLevel();
  if(levelError || level?.currentLevel !== 'aal2') return;
  const {data:allowed,error:permissionError} = await api.rpc('can_edit_match_center');
  if(permissionError || allowed!==true) return;
  container.hidden=false;
  let posts=[],isBusy=false;
  const cover=window.VXSKCover;let originalCover='';
  const input = name => $('#post-'+name);
  const coverUI=cover?.preview(input('cover'),$('#post-cover-preview'),$('#post-cover-remove'));
  const coverField=()=>input('cover')?.files?.[0]||null;
  const message=(txt,kind='')=>{const el=$('#editor-notice');el.textContent=txt;el.className='notice'+(kind?' '+kind:'');};
  const isUrl=(value,hosts)=>{if(!value)return true;try{const u=new URL(value);return u.protocol==='https:'&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch(_){return false;}};
  const streamHosts=['youtube.com','youtu.be','twitch.tv','kick.com'];
  const replayHosts=['youtube.com','youtu.be'];
  const discordHosts=['discord.gg','discord.com'];
  const parseLinks=body=>{
    const lines=String(body||'').split('\n');let stream='',replay='',discord='';
    const rest=lines.filter(line=>{
      if(/^VXSK Stream: https:\/\//i.test(line)){stream=line.replace(/^VXSK Stream: /i,'').trim();return false;}
      if(/^VXSK Replay: https:\/\//i.test(line)){replay=line.replace(/^VXSK Replay: /i,'').trim();return false;}
      if(/^VXSK Discord: https:\/\//i.test(line)){discord=line.replace(/^VXSK Discord: /i,'').trim();return false;}
      return true;
    });return {body:rest.join('\n').trim(),stream,replay,discord};
  };

  const makeText=(tag,content,cls)=>{const el=document.createElement(tag);el.textContent=String(content??'');if(cls)el.className=cls;return el;};
  const dateText=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'Invalid time':d.toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Tunis'})+' Tunis';};
  const localTunis=iso=>{
    if(!iso)return '';
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Tunis',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(x=>[x.type,x.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  };
  const requireMatch = () => {
    const match = input('kind').value==='match';
    $('#match-fields').hidden=!match;
    for(const element of ['game','mode','player-a','player-b','starts']) input(element).required=match;
    input('body').required=!match;
  };
  input('kind').addEventListener('change',requireMatch);
  function reset(){ $('#post-form').reset();input('id').value='';originalCover='';coverUI?.reset();requireMatch();$('#post-submit').textContent='SAVE POST ↗';}
  $('#post-reset').addEventListener('click',reset);
  $('#posts-refresh').addEventListener('click',load);
  function edit(post){
    input('id').value=post.id; input('kind').value=post.kind;requireMatch();
    originalCover=post.cover_path||'';coverUI?.set(cover?.url(api,originalCover)||'');
    for(const key of ['title','game','mode','body','status']) input(key).value=post[key]||'';
    input('player-a').value=post.player_a||'';input('player-b').value=post.player_b||'';
    const links=parseLinks(post.body);input('body').value=links.body;input('stream').value=links.stream;input('replay').value=links.replay;input('discord').value=links.discord;
    input('starts').value=localTunis(post.starts_at);input('published').checked=post.published;
    $('#post-submit').textContent='UPDATE POST ↗';
    container.scrollIntoView({behavior:'smooth',block:'start'});
    message('Editing: '+post.title);
  }
  async function remove(post){
    if(isBusy || !window.confirm(`Delete "${post.title}"? This removes it from the public site.`))return;
    isBusy=true;message('Deleting post…');
    try{
      const {error}=await api.from('match_center_posts').delete().eq('id',post.id);
      if(error)throw error;
      if(post.cover_path)void cover?.discard(api,post.cover_path);
      if(input('id').value===post.id)reset();await load();message('Post deleted.','success');
    }catch(_){message('Could not delete. Check role, 2FA and RLS.','error');}
    finally{isBusy=false;}
  }
  async function load(){
    const {data,error}=await api.from('match_center_posts').select('id,kind,title,game,mode,player_a,player_b,starts_at,body,status,published,cover_path,created_at,updated_at').order('created_at',{ascending:false}).limit(100);
    const list=$('#editor-posts');list.replaceChildren();
    if(error){list.append(makeText('p','Cannot load posts. Check whether SETUP-CONTENT-EDITOR.sql was run and 2FA is verified.','muted'));return;}
    posts=data||[];
    if(!posts.length){list.append(makeText('p','No announcements or showmatches yet. Create your first post.','muted'));return;}
    for(const post of posts){
      const row=makeText('article','','editor-post');
      const heading=makeText('strong',post.title);
      const state=makeText('span',post.published?'PUBLISHED':'DRAFT',post.published?'post-published':'post-draft');
      const top=makeText('div','','editor-post-top');top.append(heading,state);
      const detail=makeText('p',(post.kind==='match'?'SHOWMATCH · '+[post.player_a,'vs',post.player_b].join(' ')+' · '+dateText(post.starts_at):'ANNOUNCEMENT')+' · '+(post.status||'scheduled').toUpperCase());
      const actions=makeText('div','','editor-buttons');
      const editBtn=makeText('button','EDIT');editBtn.type='button';editBtn.addEventListener('click',()=>edit(post));
      const delBtn=makeText('button','DELETE','editor-secondary');delBtn.type='button';delBtn.addEventListener('click',()=>remove(post));
      actions.append(editBtn,delBtn);const poster=cover?.image(api,post.cover_path);if(poster)row.append(poster);row.append(top,detail,actions);list.append(row);
    }
  }
  $('#post-form').addEventListener('submit',async e=>{
    e.preventDefault();if(isBusy||!e.currentTarget.reportValidity())return;
    const kind=input('kind').value;
    const match=kind==='match';
    const dateLocal=input('starts').value;
    const startsAt=match?new Date(dateLocal+':00+01:00').toISOString():null;
    const payload={
      kind,title:input('title').value.trim(),
      game:match?input('game').value:null,
      mode:match?input('mode').value.trim():null,
      player_a:match?input('player-a').value.trim():null,
      player_b:match?input('player-b').value.trim():null,
      starts_at:startsAt,
      status:match?input('status').value:'scheduled',
      body:input('body').value.trim()||null,
      published:input('published').checked
    };
    if(match){
      const stream=input('stream').value.trim(),replay=input('replay').value.trim(),discord=input('discord').value.trim();
      if(!isUrl(stream,streamHosts)||!isUrl(replay,replayHosts)||!isUrl(discord,discordHosts)){message('Use HTTPS links from YouTube, Twitch, Kick or Discord; replays must be YouTube.','error');return;}
      payload.body=[payload.body,stream?'VXSK Stream: '+stream:'',replay?'VXSK Replay: '+replay:'',discord?'VXSK Discord: '+discord:''].filter(Boolean).join('\n')||null;
      if((payload.body||'').length>1000){message('The description and links exceed 1,000 characters. Shorten the description.','error');return;}
    }
    if(!payload.title||match&&(!payload.player_a||!payload.player_b||!payload.mode)||!match&&!payload.body){message('Please fill in all required fields.','error');return;}
    isBusy=true;$('#post-submit').disabled=true;
    message(payload.published?'Publishing post…':'Saving private draft…');
    let uploadedPath='';
    try{
      if(coverField()){if(!cover)throw Error('Cover module did not load.');uploadedPath=await cover.upload(api,coverField());payload.cover_path=uploadedPath;}
      else if(coverUI?.removed)payload.cover_path=null;
      const uuid=input('id').value;
      const result=uuid?await api.from('match_center_posts').update(payload).eq('id',uuid).select('id'):
        await api.from('match_center_posts').insert(payload).select('id');
      if(result.error||!result.data?.length)throw result.error||new Error('No row changed');
      const old=originalCover;if(old&&old!==payload.cover_path&&('cover_path' in payload))void cover?.discard(api,old);
      reset();await load();message('Saved successfully. '+(payload.published?'Visible in WHO VS WHO / WHEN section.':'Saved as a private draft.'),'success');
    }catch(error){if(uploadedPath)void cover?.discard(api,uploadedPath);message('Save failed: '+String(error?.message||'Check V12.8.33 SQL, role, 2FA or fields.').slice(0,200),'error');}
    finally{isBusy=false;$('#post-submit').disabled=false;}
  });
  reset();await load();
  api.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')container.hidden=true;});
})();
