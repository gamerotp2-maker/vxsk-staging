/* VXSK secure staff workspace. Database RLS + RPC enforce authorization; UI is not security. */
'use strict';
(async () => {
  const $ = selector => document.querySelector(selector);
  const cfg = window.VXSK_SUPABASE || {};
  let api, myRole = null, rows = [], selectedId = null, busy = false;
  const fieldLabels = {
    event:'Event', game:'Game', mode:'Mode', rank:'Rank', playerUsername:'In-game username',
    platform:'Platform', region:'Region', teamName:'Team', teammate2:'Teammate 2',
    teammate3:'Teammate 3', contactType:'Contact method', contactDetails:'Private contact',
    notes:'Player message', contactConsent:'Contact consent'
  };
  const labelName = k => fieldLabels[k] || k.replace(/([A-Z])/g,' $1');
  const gate = (title, body) => { $('#gate').hidden = false; $('#dashboard').hidden=true; $('#gate-title').textContent=title; $('#gate-message').textContent=body; };
  const notice = (message='',type='') => {const el=$('#notice');el.textContent=message;el.className='notice'+(type?' '+type:'');};
  const text = (tag,value,cls='') => {const el=document.createElement(tag);el.textContent=String(value ?? '');if(cls)el.className=cls;return el;};
  const formatDate = s => {const d=new Date(s);return Number.isNaN(d.getTime())?'—':d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});};
  const dataName = row => String(row.form_data?.playerUsername||row.form_data?.player_username||'Player application').slice(0,80);
  const dataSearch = row => [row.form_data?.playerUsername,row.form_data?.game,row.form_data?.mode].join(' ').toLowerCase();
  const statusTag = status => text('span',status,'status '+status);
  const isReviewer = () => ['owner','reviewer'].includes(myRole);
  try {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url||'') || !cfg.publishableKey || cfg.publishableKey.includes('PASTE_') || !window.supabase?.createClient) {
      gate('Website not configured','VXSK admin: copy the configured supabase-config.js into this deploy. Never use secret/service-role keys in the browser.');return;
    }
    if(window.VXSK_STAGING_BLOCKED){gate('Staging safety lock','This preview is using production Supabase credentials. Configure a separate staging project before testing.');return;}
    api = window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    window.VXSK_STAFF_API = api; // Share one auth client with the content editor.
    const {data:userData,error:userError} = await api.auth.getUser();
    if (userError || !userData?.user) {gate('Please sign in','Open MY ACCOUNT on the VXSK website, sign in and complete 2FA before opening the staff workspace.');return;}
    const {data:level,error:levelError} = await api.auth.mfa.getAuthenticatorAssuranceLevel();
    if (levelError || level?.currentLevel !== 'aal2') {gate('Two-factor authentication required','Your VXSK account must finish authenticator verification (6-digit code) before private staff data is accessible.');return;}
    const {data:access,error:roleError} = await api.from('staff_roles').select('role').eq('user_id',userData.user.id).maybeSingle();
    if (roleError) {gate('Could not verify access','Supabase could not verify your role. Refresh once; if this continues, contact the VXSK owner.');return;}
    if (!['owner','reviewer','staff'].includes(access?.role)) {gate('Staff access only','Your account has not been granted a VXSK staff role. Normal players cannot view applications.');return;}
    myRole=access.role;
    $('#gate').hidden=true;$('#dashboard').hidden=false;
    $('#my-role').textContent = myRole.toUpperCase();
    $('#my-user').textContent = 'Account protected with 2FA';
    $('#filter-status').addEventListener('change',renderList);
    $('#filter-search').addEventListener('input',renderList);
    $('#refresh').addEventListener('click',loadRows);
    $('#approve').addEventListener('click',()=>review('approved'));
    $('#reject').addEventListener('click',()=>review('rejected'));
    $('#owner-delete-registration')?.addEventListener('click',deleteSelectedRegistration);
    $('#staff-inbox-regular')?.addEventListener('click',()=>switchInbox('regular'));
    $('#note-form').addEventListener('submit',saveNote);
    await loadRows();
    window.dispatchEvent(new CustomEvent('vxsk:staff-ready',{detail:{role:myRole}}));
    api.auth.onAuthStateChange((event)=>{
      if(event==='SIGNED_OUT'){ rows=[];selectedId=null;gate('Signed out','Sign in to VXSK with 2FA before accessing staff applications.'); }
    });
  } catch(_err) {gate('Could not open staff dashboard','Please confirm the configured Supabase project, your login session and 2FA, then reload.');}
  async function loadRows(){
    if (!myRole) return;
    notice('Loading private registrations…');
    const {data,error}=await api.from('registrations').select('id,netlify_submission_id,form_data,status,submitted_at,reviewed_by,reviewed_at').order('submitted_at',{ascending:false}).limit(200);
    if(error){ notice('Unable to load registrations. Access might have changed; please check permissions.','error');return; }
    rows=data||[];
    for(const status of ['pending','approved','rejected']) $('#count-'+status).textContent=rows.filter(x=>x.status===status).length;
    $('#count-total').textContent=rows.length;
    const countEl=$('#regular-inbox-count');if(countEl)countEl.textContent=rows.length;
    notice(rows.length===200?'Showing the 200 newest records. Older records need pagination.':'');
    if(selectedId && !rows.some(x=>x.id===selectedId)) selectedId=null;
    renderList();
    if(selectedId) await renderDetails();
    else {$('#detail-content').hidden=true;$('#detail-placeholder').hidden=false;}
  }
  function renderList(){
    const list=$('#application-list');list.replaceChildren();
    const status=$('#filter-status').value;
    const query=$('#filter-search').value.trim().toLowerCase();
    const visible=rows.filter(r=>(status==='all'||r.status===status)&&(!query||dataSearch(r).includes(query)));
    $('#list-total').textContent=visible.length;
    if(!visible.length){
      list.append(text('p',rows.length?'No applications match these filters.':'No applications in Supabase yet. Netlify Forms data does not sync automatically.','muted'));
      return;
    }
    for(const item of visible){
      const b=document.createElement('button');b.type='button';b.className='entry'+(selectedId===item.id?' active':'');
      const top=document.createElement('div');top.className='entry-top';top.append(text('strong',dataName(item),'entry-player'),statusTag(item.status));
      b.append(top,text('span',[item.form_data?.game,item.form_data?.mode,item.form_data?.rank].filter(Boolean).join(' · ')||'VXSK application','entry-sub'),text('span',formatDate(item.submitted_at),'entry-date'));
      b.addEventListener('click',async()=>{selectedId=item.id;renderList();await renderDetails();});
      list.append(b);
    }
  }
  async function renderDetails(){
    const row=rows.find(r=>r.id===selectedId);if(!row)return;
    $('#detail-placeholder').hidden=true;$('#detail-content').hidden=false;
    const heading=$('#detail-heading');heading.replaceChildren();const h=text('h3',dataName(row));heading.append(h,statusTag(row.status));
    const dl=$('#detail-data');dl.replaceChildren();
    const fields=row.form_data&&typeof row.form_data==='object'&&!Array.isArray(row.form_data)?row.form_data:{};
    for(const [key,value] of Object.entries(fields)){
      if(['form-name','form_name','vxsk-trap','g-recaptcha-response'].includes(key)||value==null||value==='')continue;
      const box=document.createElement('div');box.append(text('dt',labelName(key)),text('dd',typeof value==='object'?JSON.stringify(value).slice(0,2000):String(value).slice(0,2000)));dl.append(box);
    }
    const meta=document.createElement('div');meta.append(text('dt','Submitted'),text('dd',formatDate(row.submitted_at)));dl.append(meta);
    if(row.reviewed_at){const r=document.createElement('div');r.append(text('dt','Reviewed'),text('dd',formatDate(row.reviewed_at)));dl.append(r);}
    $('#review-actions').hidden=!(isReviewer()&&row.status==='pending');
    if($('#owner-delete-wrap'))$('#owner-delete-wrap').hidden=myRole!=='owner';
    $('#note-text').value='';
    await loadNotes(row.id);
  }
  async function loadNotes(registrationId){
    const list=$('#notes-list');list.replaceChildren(text('p','Loading notes…','muted'));
    const {data,error}=await api.from('review_notes').select('id,author_id,note,created_at').eq('registration_id',registrationId).order('created_at',{ascending:true}).limit(100);
    if(selectedId!==registrationId)return;
    list.replaceChildren();
    if(error){list.append(text('p','Could not load private notes.','muted'));return;}
    if(!data?.length){list.append(text('p','No internal notes yet.','muted'));return;}
    for(const n of data){const el=document.createElement('div');el.className='note';el.append(text('small','Staff note · '+formatDate(n.created_at)),text('div',n.note));list.append(el);}
  }
  async function review(decision){
    const row=rows.find(r=>r.id===selectedId);
    if(!row||!isReviewer()||row.status!=='pending'||busy)return;
    if(!window.confirm((decision==='approved'?'Approve':'Reject')+' this VXSK application?'))return;
    busy=true;$('#approve').disabled=true;$('#reject').disabled=true;notice('Saving review decision…');
    try{
      const {data,error}=await api.rpc('review_registration',{p_registration_id:row.id,p_decision:decision});
      if(error||data!==true)throw new Error('Review was not accepted. Check permissions, 2FA or application status.');
      selectedId=row.id;await loadRows();notice('Application '+decision+' successfully.','success');
    }catch(err){notice(err.message||'Review could not be saved.','error');}
    finally{busy=false;$('#approve').disabled=false;$('#reject').disabled=false;}
  }
  function switchInbox(which){
    const isOpp=which==='opponents';
    $('#regular-inbox').hidden=isOpp;
    $('#opponent-inbox').hidden=!isOpp;
    $('#staff-inbox-regular').classList.toggle('is-active',!isOpp);
    $('#staff-inbox-opponents').classList.toggle('is-active',isOpp);
    $('#staff-inbox-regular').setAttribute('aria-pressed',String(!isOpp));
    $('#staff-inbox-opponents').setAttribute('aria-pressed',String(isOpp));
    if(isOpp)window.dispatchEvent(new Event('vxsk:opponent-inbox-open'));
  }
  async function deleteSelectedRegistration(){
    if(myRole!=='owner'||!selectedId||busy)return;
    const row=rows.find(r=>r.id===selectedId);if(!row)return;
    if(!confirm(`OWNER ONLY: Permanently delete ${dataName(row)}'s application AND its review notes? This cannot be undone.`))return;
    const typed=prompt('To confirm permanent deletion, type DELETE exactly:');
    if(typed!=='DELETE')return;
    busy=true;$('#owner-delete-registration').disabled=true;notice('Deleting selected registration…');
    try{
      const {data,error}=await api.rpc('owner_delete_registration',{p_registration_id:selectedId});
      if(error||data!==true)throw new Error('Deletion not confirmed. Verify owner access, 2FA and migration.');
      selectedId=null;await loadRows();notice('Registration deleted by owner.','success');
    }catch(error){notice(error.message||'Could not delete registration.','error');}
    finally{busy=false;$('#owner-delete-registration').disabled=false;}
  }
  async function saveNote(event){
    event.preventDefault();const note=$('#note-text').value.trim();
    if(!selectedId||!note||note.length>2000||busy)return;
    busy=true;$('#save-note').disabled=true;notice('Saving note…');
    try{
      const {error}=await api.from('review_notes').insert({registration_id:selectedId,note});
      if(error)throw error;
      $('#note-text').value='';await loadNotes(selectedId);notice('Internal note saved.','success');
    }catch(_){notice('Could not save note. Check database permissions.','error');}
    finally{busy=false;$('#save-note').disabled=false;}
  }
})();
