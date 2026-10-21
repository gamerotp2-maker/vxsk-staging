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
  const message=(txt,kind='')=>{const el=$('#editor-notice');el.textContent=txt;el.className='notice'+(kind?' '+kind:'');};
  const input = name => $('#post-'+name);
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
  function reset(){ $('#post-form').reset();input('id').value='';requireMatch();$('#post-submit').textContent='SAVE POST ↗';}
  $('#post-reset').addEventListener('click',reset);
  $('#posts-refresh').addEventListener('click',load);
  function edit(post){
    input('id').value=post.id; input('kind').value=post.kind;requireMatch();
    for(const key of ['title','game','mode','body','status']) input(key).value=post[key]||'';
    input('player-a').value=post.player_a||'';input('player-b').value=post.player_b||'';
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
      if(input('id').value===post.id)reset();await load();message('Post deleted.','success');
    }catch(_){message('Could not delete. Check role, 2FA and RLS.','error');}
    finally{isBusy=false;}
  }
  async function load(){
    const {data,error}=await api.from('match_center_posts').select('id,kind,title,game,mode,player_a,player_b,starts_at,body,status,published,created_at,updated_at').order('created_at',{ascending:false}).limit(100);
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
      actions.append(editBtn,delBtn);row.append(top,detail,actions);list.append(row);
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
    if(!payload.title||match&&(!payload.player_a||!payload.player_b||!payload.mode)||!match&&!payload.body){message('Please fill in all required fields.','error');return;}
    isBusy=true;$('#post-submit').disabled=true;
    message(payload.published?'Publishing post…':'Saving private draft…');
    try{
      const uuid=input('id').value;
      const result=uuid?await api.from('match_center_posts').update(payload).eq('id',uuid).select('id'):
        await api.from('match_center_posts').insert(payload).select('id');
      if(result.error||!result.data?.length)throw result.error||new Error('No row changed');
      reset();await load();message('Saved successfully. '+(payload.published?'Visible in WHO VS WHO / WHEN section.':'Saved as a private draft.'),'success');
    }catch(_){message('Save refused. Check database setup, account role, 2FA or post fields.','error');}
    finally{isBusy=false;$('#post-submit').disabled=false;}
  });
  reset();await load();
  api.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')container.hidden=true;});
})();
