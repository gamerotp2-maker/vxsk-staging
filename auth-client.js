'use strict';
// VXSK client account UI. Real credentials are handled by Supabase Auth only.
// Never embed a service_role or secret key into this public JavaScript.
(() => {
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => Array.from(root.querySelectorAll(q));
  const dialog = $('#account-dialog');
  const message = $('#account-status');
  const switchbar = $('#auth-switch');
  const views = new Set(['signin','signup','forgot','reset','profile','mfa-login','mfa-setup','nickname']);
  const config = window.VXSK_SUPABASE || {};
  const enabled = !window.VXSK_STAGING_BLOCKED && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url || '') &&
    !String(config.url).toLowerCase().includes('your-project') &&
    typeof config.publishableKey === 'string' &&
    (config.publishableKey.startsWith('sb_publishable_') || config.publishableKey.startsWith('eyJ')) &&
    !config.publishableKey.includes('PASTE_') &&
    Boolean(window.supabase && window.supabase.createClient);
  const api = enabled ? window.supabase.createClient(config.url, config.publishableKey, {
    auth: {autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}
  }) : null;
  // Read-only client reference for first-party authenticated registration.
  window.VXSKAuth = Object.freeze({client: api});
  // OAuth providers are configured in Supabase dashboard; no provider client secret in website code.
  document.querySelectorAll('[data-oauth]').forEach(button => button.addEventListener('click', async () => {
    if (!api) { notify(window.VXSK_STAGING_BLOCKED ? 'Staging safety lock: production Supabase URL detected.' : !(window.supabase && window.supabase.createClient) ? 'Supabase JavaScript library did not load. Check connection or browser extensions.' : 'Supabase configuration missing or invalid. Check deployed supabase-config.js.','error');return; }
    const provider=button.dataset.oauth;
    if(!['google','discord'].includes(provider))return;
    button.disabled=true;
    try {
      const {error}=await api.auth.signInWithOAuth({provider,options:{redirectTo:new URL('./', location.href).href}});
      if(error)throw error;
    } catch(error){ notify(explain(error, 'Could not start '+provider+' sign in. Check provider setup in Supabase.'),'error');button.disabled=false; }
  }));
  let currentUser = null;
  let activeView = 'signin';
  let busy = false;
  let lastTrigger = null;
  let recovering = false;
  let verifiedFactor = null;
  let pendingFactor = null;
  let avatarObjectUrl = null;
  let mfaRequired = false;
  let myAppsRequest = 0;
  let myOpponentRequest = 0;
  let opponentLoadedAt=0;
  let opponentStatusSignature='';
  const navChip = $('#nav-user-chip');
  const navAvatar = $('#nav-avatar');
  const navAvatarFallback = $('#nav-avatar-fallback');
  const navNickname = $('#nav-nickname');
  const navStaff = $('#nav-staff-link');
  let cropImage = null;
  let cropImageUrl = null;
  let cropOffsetX = 0, cropOffsetY = 0;
  let cropZoom = 1;
  const avatarCanvas = $('#avatar-canvas');
  const avatarCtx = avatarCanvas?.getContext('2d');
  function nicknameFor(user) {
    const metadata = user?.user_metadata || {};
    const explicit = String(metadata.vxsk_nickname||'').trim();
    const sources = [metadata.global_name, metadata.preferred_username, metadata.user_name, metadata.full_name, metadata.name];
    const suggested = sources.find(s => typeof s === 'string' && /^[A-Za-z0-9_.-]{3,24}$/.test(s.trim()));
    return explicit || suggested || String(user?.email || 'Player').split('@')[0].replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,24) || 'Player';
  }
  function nicknameValid(name){return /^[A-Za-z0-9_.-]{3,24}$/.test(name);}
  function displayNickname(){
    const nick=nicknameFor(currentUser);
    if(navNickname)navNickname.textContent=nick;
    if($('#account-display-name'))$('#account-display-name').textContent=nick;
    if($('#account-nickname'))$('#account-nickname').value=currentUser?.user_metadata?.vxsk_nickname||nick;
    if($('#first-nickname')&&!$('#first-nickname').value)$('#first-nickname').value=nick;
    if(navAvatarFallback)navAvatarFallback.textContent=nick.charAt(0).toUpperCase();
    if($('#avatar-placeholder'))$('#avatar-placeholder').textContent=nick.charAt(0).toUpperCase();
  }
  function resetNav(){
    if(navChip)navChip.hidden=true;
    if(navStaff)navStaff.hidden=true;
    if(navAvatar){navAvatar.hidden=true;navAvatar.removeAttribute('src');}
    if(navAvatarFallback)navAvatarFallback.hidden=false;
    $('#nav-account-label').textContent='SIGN IN';
  }
  function renderCrop(){
    if(!cropImage||!avatarCtx)return;
    const side=avatarCanvas.width;
    const natural=Math.min(cropImage.width,cropImage.height);
    const srcSide=natural/cropZoom;
    const maxX=(cropImage.width-srcSide)/2;
    const maxY=(cropImage.height-srcSide)/2;
    cropOffsetX=Math.max(-maxX,Math.min(maxX,cropOffsetX));
    cropOffsetY=Math.max(-maxY,Math.min(maxY,cropOffsetY));
    avatarCtx.clearRect(0,0,side,side);
    avatarCtx.drawImage(cropImage,(cropImage.width-srcSide)/2+cropOffsetX,(cropImage.height-srcSide)/2+cropOffsetY,srcSide,srcSide,0,0,side,side);
  }
  $('#avatar-file')?.addEventListener('change',()=>{
    if(cropImageUrl)URL.revokeObjectURL(cropImageUrl);
    cropImageUrl=null;cropImage=null;$('#avatar-editor').hidden=true;
    const file=$('#avatar-file').files?.[0];
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){notify('Choose PNG, JPG or WebP up to 10 MB.','error');return;}
    cropImageUrl=URL.createObjectURL(file);
    const img=new Image();img.onload=()=>{
      if(img.width*img.height>35000000){notify('Please choose a smaller image.','error');return;}
      cropImage=img;cropOffsetX=0;cropOffsetY=0;cropZoom=1;$('#avatar-zoom').value='1';
      $('#avatar-editor').hidden=false;renderCrop();
    };
    img.onerror=()=>notify('Could not open that image. Try a different file.','error');
    img.src=cropImageUrl;
  });
  $('#avatar-zoom')?.addEventListener('input', e=>{cropZoom=Number(e.target.value)||1;renderCrop();});
  let dragPos=null;
  avatarCanvas?.addEventListener('pointerdown',e=>{if(!cropImage)return;dragPos={x:e.clientX,y:e.clientY};avatarCanvas.setPointerCapture(e.pointerId);});
  avatarCanvas?.addEventListener('pointermove',e=>{
    if(!dragPos||!cropImage)return;
    const rect=avatarCanvas.getBoundingClientRect();
    const factor=(Math.min(cropImage.width,cropImage.height)/cropZoom)/Math.max(1,rect.width);
    cropOffsetX-=(e.clientX-dragPos.x)*factor;
    cropOffsetY-=(e.clientY-dragPos.y)*factor;
    dragPos={x:e.clientX,y:e.clientY};renderCrop();
  });
  avatarCanvas?.addEventListener('pointerup',()=>dragPos=null);
  avatarCanvas?.addEventListener('pointercancel',()=>dragPos=null);
  function saveAvatarBlob(){return new Promise((resolve,reject)=>avatarCanvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image export failed')),'image/webp',.88));}
  async function saveNickname(value){
    if(!currentUser||mfaRequired)throw {publicMessage:'Complete sign in first.'};
    const nickname=value.trim();
    if(!nicknameValid(nickname))throw {publicMessage:'Use 3–24 letters, numbers, underscores, dots or hyphens.'};
    const response=assert(await api.auth.updateUser({data:{vxsk_nickname:nickname}}));
    currentUser=response.user;displayNickname();
  }
  $('#nickname-form')?.addEventListener('submit',e=>{e.preventDefault();
    run(e.currentTarget.querySelector('button'),async()=>{await saveNickname($('#account-nickname').value);notify('Your display name has been updated.','success');});
  });
  $('#first-nickname-form')?.addEventListener('submit',e=>{e.preventDefault();
    run(e.currentTarget.querySelector('button'),async()=>{await saveNickname($('#first-nickname').value);view('profile');notify('Welcome to your VXSK arena!','success');});
  });
  $('#nickname-later')?.addEventListener('click',()=>{
    if(currentUser){try{sessionStorage.setItem('vxsk_skip_nickname_'+currentUser.id,'1');}catch(_){}}
    view('profile');
  });

  const myAppsMessage = $('#my-apps-message');
  const myAppsList = $('#my-apps-list');
  const myAppsRefreshButton = $('#my-apps-refresh');
  function clearMyApplications() {
    ++myAppsRequest;
    ++myOpponentRequest;
    if (myAppsList) { myAppsList.replaceChildren(); myAppsList.hidden = true; }
    if (myAppsMessage) myAppsMessage.textContent = 'Sign in to see your applications.';
    const opponentList = $('#my-opponent-list');
    const opponentMessage = $('#my-opponent-message');
    if (opponentList) { opponentList.replaceChildren(); opponentList.hidden = true; }
    if (opponentMessage) opponentMessage.textContent = 'Sign in to see your opponent requests.';
    opponentLoadedAt=0; opponentStatusSignature='';
    const spotlight=$('#opponent-status-spotlight'); if(spotlight)spotlight.hidden=true;
  }
  function readableDate(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : 'Date unavailable';
  }
  // Permanently remove only the signed-in player's own opponent request.
  // Supabase RPC independently verifies request ownership; hiding a button is not security.
  async function deleteMyOpponentRequest(itemId, button) {
    if (!api || !currentUser || mfaRequired || !itemId || button.disabled) return;
    if (!window.confirm('Permanently delete this No Opponent request? It will disappear from your My Account and the VXSK Staff Panel. This cannot be undone.')) return;
    const accountId = currentUser.id;
    button.disabled = true;
    button.textContent = 'DELETING…';
    try {
      const {data: deleted, error} = await api.rpc('delete_opponent_request', {p_request_id: itemId});
      if (error) throw error;
      if (deleted !== true) throw new Error('Request was not deleted. It may already be deleted or does not belong to this account.');
      if (currentUser?.id !== accountId) return;
      notify('Your No Opponent request was permanently deleted.','success');
      await loadMyOpponentRequests();
    } catch (error) {
      notify(error?.message || 'Could not delete this opponent request. Try Refresh.', 'error');
      button.disabled = false;
      button.textContent = 'DELETE REQUEST';
    }
  }
  // No Opponent? requests are stored separately from event registrations.
  // Player RLS permits reading only rows with applicant_user_id = auth.uid().
  async function loadMyOpponentRequests() {
    const opponentList = $('#my-opponent-list');
    const opponentMessage = $('#my-opponent-message');
    if (!opponentList || !opponentMessage || !api || !currentUser || mfaRequired) return;
    const userId = currentUser.id;
    const requestId = ++myOpponentRequest;
    opponentMessage.textContent = 'Loading your opponent requests…';
    const spotlight=$('#opponent-status-spotlight');
    const spotStatus=$('#opponent-status-badge');
    const spotTitle=$('#opponent-status-main');
    const spotSubtitle=$('#opponent-status-subtitle');
    if(spotlight){spotlight.hidden=false;spotlight.dataset.status='loading';spotTitle.textContent='CHECKING STATUS…';spotSubtitle.textContent='Loading No Opponent requests for your signed-in account.';spotStatus.textContent='LOADING';spotStatus.className='my-apps-status';}
    opponentList.hidden = true;
    opponentList.replaceChildren();
    try {
      const {data, error} = await api.from('opponent_requests')
        .select('id, status, submitted_at, form_data')
        .eq('applicant_user_id', userId)
        .order('submitted_at', {ascending: false})
        .limit(40);
      if (error) throw error;
      if (requestId !== myOpponentRequest || currentUser?.id !== userId || mfaRequired) return;
      if (!Array.isArray(data) || !data.length) {
        opponentMessage.textContent = 'No opponent request belongs to this signed-in account. Staff Inbox shows all players’ requests, but My Account only shows yours. Check the account that originally submitted the request.';
        if(spotlight){spotlight.dataset.status='none';spotTitle.textContent='NO REQUEST ON THIS ACCOUNT';spotStatus.textContent='NONE';spotStatus.className='my-apps-status';spotSubtitle.textContent='If you marked a request Matched in Staff Panel, check which account submitted that request.';}
        return;
      }
      const frag = document.createDocumentFragment();
      for (const item of data) {
        const status = ['pending','reviewed','matched','closed'].includes(item.status)
          ? item.status : 'pending';
        const entry = document.createElement('li');
        entry.className = 'my-apps-item';
        const line = document.createElement('div');
        line.className = 'my-apps-line';
        const title = document.createElement('strong');
        const game = ['Rocket League','VALORANT','League of Legends'].includes(item.form_data?.game)
          ? item.form_data.game : 'VXSK';
        const mode = typeof item.form_data?.mode === 'string' && item.form_data.mode.length <= 32
          ? item.form_data.mode : 'Find an opponent';
        title.textContent = `${game} · ${mode}`;
        const chip = document.createElement('span');
        chip.className = `my-apps-status is-${status}`;
        chip.textContent = status.toUpperCase();
        line.append(title, chip);
        const detail = document.createElement('small');
        const explanation = {
          pending: 'Waiting for staff to review your request',
          reviewed: 'Staff reviewed your request and is looking for an opponent',
          matched: 'Staff marked your request as matched. Opponent details are not yet available here',
          closed: 'This request has been closed'
        }[status];
        detail.textContent = `Requested ${readableDate(item.submitted_at)} · Ref ${String(item.id).slice(0,8)} · ${explanation}`;
        const actions = document.createElement('div');
        actions.className = 'my-opponent-actions';
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'my-opponent-delete';
        deleteButton.textContent = 'DELETE REQUEST';
        deleteButton.setAttribute('aria-label', `Permanently delete ${game} ${mode} opponent request`);
        deleteButton.addEventListener('click', () => deleteMyOpponentRequest(item.id, deleteButton));
        actions.append(deleteButton);
        entry.append(line, detail, actions);
        frag.append(entry);
      }
      if(spotlight){
        const latest=data[0];
        const current=['pending','reviewed','matched','closed'].includes(latest.status)?latest.status:'pending';
        const game=String(latest.form_data?.game||'VXSK').slice(0,42);
        spotlight.dataset.status=current;
        spotTitle.textContent=game.toUpperCase()+' / '+String(latest.form_data?.mode||'MATCH REQUEST').slice(0,22).toUpperCase();
        spotStatus.className='my-apps-status is-'+current;
        spotStatus.textContent=current.toUpperCase();
        spotSubtitle.textContent=current==='matched'?'Staff marked this request as matched. Opponent details have not been assigned in the website yet.':current==='reviewed'?'Staff reviewed your request and is searching for an opponent.':current==='pending'?'Your request is waiting for staff review.':'Your request has been closed.';
      }
      opponentList.append(frag);
      opponentList.hidden = false;
      opponentLoadedAt=Date.now();
      const signature=data.map(row=>String(row.id)+':'+String(row.status)).join('|');
      if(opponentStatusSignature && signature!==opponentStatusSignature){
        opponentMessage.textContent='Your opponent request status has been updated. Latest status shown below.';
      }else{
        opponentMessage.textContent=`${data.length} opponent request${data.length === 1 ? '' : 's'} found · updated ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}.`;
      }
      opponentStatusSignature=signature;
    } catch (_) {
      if (requestId !== myOpponentRequest || currentUser?.id !== userId) return;
      opponentMessage.textContent = 'Could not load your opponent requests from Supabase. The Staff Panel update may have worked, but My Account cannot verify it yet. Check the read policy or your connection.';
      if(spotlight){spotlight.dataset.status='error';spotTitle.textContent='STATUS UNAVAILABLE';spotStatus.textContent='ERROR';spotStatus.className='my-apps-status';spotSubtitle.textContent='Database read failed. Please refresh; do not assume your request is Pending.';}
    }
  }
  // RLS in Supabase enforces applicant_user_id = auth.uid() for normal players.
  // The user-id filter also avoids requesting other users' data unnecessarily.
  async function loadMyApplications() {
    if (!myAppsList || !myAppsMessage || !api || !currentUser || mfaRequired) {
      clearMyApplications();
      return;
    }
    const userId = currentUser.id;
    const requestId = ++myAppsRequest;
    myAppsRefreshButton.disabled = true;
    void loadMyOpponentRequests();
    myAppsMessage.textContent = 'Loading your applications…';
    myAppsList.hidden = true;
    myAppsList.replaceChildren();
    try {
      const {data, error} = await api.from('registrations')
        .select('id, status, submitted_at, form_data')
        .eq('applicant_user_id', userId)
        .order('submitted_at', {ascending: false})
        .limit(40);
      if (error) throw error;
      if (requestId !== myAppsRequest || currentUser?.id !== userId || mfaRequired) return;
      if (!Array.isArray(data) || !data.length) {
        myAppsMessage.textContent = 'No applications yet. Join a tournament to see your status here.';
        return;
      }
      const frag = document.createDocumentFragment();
      for (const item of data) {
        const status = ['pending', 'approved', 'rejected'].includes(item.status)
          ? item.status : 'pending';
        const entry = document.createElement('li');
        entry.className = 'my-apps-item';
        const line = document.createElement('div');
        line.className = 'my-apps-line';
        const title = document.createElement('strong');
        const game = ['Rocket League','VALORANT','League of Legends'].includes(item.form_data?.game) ? item.form_data.game : 'VXSK';
        const mode = typeof item.form_data?.mode === 'string' && item.form_data.mode.length <= 32 ? item.form_data.mode : 'Event';
        title.textContent = `${game} · ${mode}`;
        const chip = document.createElement('span');
        chip.className = `my-apps-status is-${status}`;
        chip.textContent = status.toUpperCase();
        line.append(title, chip);
        const detail = document.createElement('small');
        const statusDetail = status === 'pending' ? 'Awaiting staff review' :
          status === 'approved' ? 'Approved by staff — event place not yet guaranteed' :
          'Reviewed by staff — not approved';
        detail.textContent = `Submitted ${readableDate(item.submitted_at)} · ${statusDetail}`;
        entry.append(line, detail);
        frag.append(entry);
      }
      myAppsList.append(frag);
      myAppsList.hidden = false;
      myAppsMessage.textContent = `${data.length} application${data.length === 1 ? '' : 's'} found. Refresh to check for new staff decisions.`;
    } catch (_) {
      if (requestId !== myAppsRequest || currentUser?.id !== userId) return;
      myAppsMessage.textContent = 'Could not load your applications. Try Refresh. If this continues, contact VXSK support.';
    } finally {
      if (requestId === myAppsRequest) myAppsRefreshButton.disabled = false;
    }
  }
  myAppsRefreshButton?.addEventListener('click', loadMyApplications);
  $('#my-opponents-refresh')?.addEventListener('click', loadMyOpponentRequests);
  $('#opponent-status-jump')?.addEventListener('click', () => $('#my-opponents-title')?.scrollIntoView({behavior:'smooth',block:'center'}));
  // Staff may update a request in another tab. Refresh on return and while
  // My Account is open; do not confuse owner/staff inbox with player's own requests.
  function refreshOpponentWhenVisible(){
    if(dialog?.open && activeView==='profile' && currentUser && !mfaRequired && !document.hidden){
      if(Date.now()-opponentLoadedAt>5000) void loadMyOpponentRequests();
    }
  }
  window.addEventListener('focus', refreshOpponentWhenVisible);
  document.addEventListener('visibilitychange', refreshOpponentWhenVisible);
  setInterval(()=>{
    if(dialog?.open && activeView==='profile' && currentUser && !mfaRequired && !document.hidden && Date.now()-opponentLoadedAt>30000){
      void loadMyOpponentRequests();
    }
  },15000);

  window.addEventListener('vxsk:opponent-request-submitted', () => {
    if (dialog.open && currentUser && !mfaRequired) void loadMyOpponentRequests();
  });
  window.addEventListener('vxsk:application-submitted', () => {
    if (dialog.open && currentUser && !mfaRequired) void loadMyApplications();
  });


  function notify(text, kind = '') {
    message.textContent = text;
    message.className = 'account-status' + (kind ? ` ${kind}` : '');
  }
  function view(name, keepStatus=false) {
    if (!views.has(name)) return;
    activeView = name;
    $$('[data-auth-panel]').forEach(panel => {panel.hidden = panel.dataset.authPanel !== name;});
    switchbar.hidden = !['signin','signup'].includes(name);
    document.querySelector('#oauth-buttons').hidden = !['signin','signup'].includes(name);
    $$('[data-switch]',switchbar).forEach(button => {
      const selected = button.dataset.switch === name;
      button.classList.toggle('is-active',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    if (!keepStatus) notify('');
  }
  function open(name = 'signin', trigger = null) {
    lastTrigger = trigger;
    view(recovering ? 'reset' : mfaRequired ? 'mfa-login' : currentUser ? 'profile' : name);
    if (!dialog.open) dialog.showModal();
    if (currentUser && !mfaRequired) void loadMyApplications();
  }
  function configured() {
    if (api) return true;
    notify(window.VXSK_STAGING_BLOCKED ? 'Staging safety lock: production Supabase URL detected.' : !(window.supabase && window.supabase.createClient) ? 'Supabase JavaScript library did not load. Check network or browser extensions.' : 'Account service not configured. Check the deployed supabase-config.js.','error');
    return false;
  }
  function assert(result) {
    if (result.error) throw result.error;
    return result.data;
  }
  function explain(error, defaultMessage='Request failed. Please try again later.') {
    if (!navigator.onLine) return 'No internet connection. Please try again when online.';
    if (error?.message?.includes('Invalid login credentials')) return 'Invalid email or password. Check your details and email verification.';
    if (error?.message?.includes('Email not confirmed')) return 'Confirm your email first, then sign in.';
    if (error?.message?.includes('already registered')) return 'If you already have an account, please sign in or reset your password.';
    if (error?.message?.includes('rate limit')) return 'Too many requests. Please wait before trying again.';
    if (error?.message?.includes('Email address not authorized') || error?.code==='email_address_not_authorized') return 'Email sending is not configured for new players yet. VXSK admin: configure Supabase custom SMTP.';
    if (/invalid.*(totp|factor|code)|otp.*invalid|challenge.*failed/i.test(error?.message || '')) return 'That 6-digit code was not accepted. Check the authenticator app clock and try again.';
    if (error?.message?.includes('Auth session missing')) return 'Your session expired. Please sign in again.';
    return defaultMessage;
  }
  async function run(button, job) {
    if (busy || !configured()) return;
    busy = true;
    button.disabled = true;
    const oldLabel=button.textContent;
    button.textContent='PLEASE WAIT…';
    notify('');
    try { await job(); }
    catch(error) { notify(explain(error, error?.publicMessage || 'Something went wrong. Try again or contact VXSK support.'), 'error'); }
    finally {busy=false;button.disabled=false;button.textContent=oldLabel;}
  }
  const pwValid = form => {
    if (form.elements.password.value.length < 12 || form.elements.password.value !== form.elements.confirm.value) {
      notify('Use 12+ characters and matching passwords.','error');return false;
    }
    return true;
  };
  async function refresh() {
    if (!api) return;
    const session = assert(await api.auth.getSession()).session;
    currentUser = session?.user || null;
    $('#nav-account-label').textContent = currentUser ? 'MY ACCOUNT' : 'SIGN IN';
    $('#account-email').textContent = currentUser?.email || '';
    verifiedFactor = null;
    const staffLink = $('#account-staff-link');
    if (staffLink) staffLink.hidden = true;
    if(navStaff)navStaff.hidden=true;
    if(navChip)navChip.hidden=true;
    if (!currentUser) {
      mfaRequired=false;
      clearMyApplications();resetNav();
      if (dialog.open && ['profile','mfa-login','mfa-setup','nickname'].includes(activeView)) view('signin');
      return;
    }
    const level = assert(await api.auth.mfa.getAuthenticatorAssuranceLevel());
    mfaRequired = level.currentLevel === 'aal1' && level.nextLevel === 'aal2';
    if (!mfaRequired && level.currentLevel === 'aal2' && staffLink) {
      // UI convenience only; the database independently enforces RLS and MFA.
      const roleResult = await api.from('staff_roles').select('role').eq('user_id', currentUser.id).maybeSingle();
      const roleAllowed=!roleResult.error && ['owner','reviewer','staff'].includes(roleResult.data?.role);
      staffLink.hidden=!roleAllowed;
      if(navStaff)navStaff.hidden=!roleAllowed;
    }
    if (mfaRequired) {
      resetNav();
      view('mfa-login');
      if (!dialog.open) dialog.showModal();
      return;
    }
    const factors = assert(await api.auth.mfa.listFactors());
    verifiedFactor = factors.totp?.find(f=>f.status === 'verified') || null;
    $('#mfa-badge').textContent = verifiedFactor ? '2FA ENABLED' : '2FA OFF';
    $('#mfa-badge').classList.toggle('on',Boolean(verifiedFactor));
    $('#mfa-start').hidden = Boolean(verifiedFactor);
    $('#mfa-remove').hidden = !verifiedFactor;
    if($('#profile-mfa-status')) {
      $('#profile-mfa-status').textContent=verifiedFactor?'◆ 2FA PROTECTED':'2FA NOT ENABLED';
      $('#profile-mfa-status').classList.toggle('on',Boolean(verifiedFactor));
    }
    if(navChip)navChip.hidden=false;
    if(navAvatarFallback)navAvatarFallback.hidden=false;
    if($('#nav-verified'))$('#nav-verified').hidden=!verifiedFactor;
    displayNickname();
    await showAvatar();
    let skippedNickname=false;
    try{skippedNickname=Boolean(sessionStorage.getItem('vxsk_skip_nickname_'+currentUser.id));}catch(_){}
    const needsNickname=!currentUser.user_metadata?.vxsk_nickname && !skippedNickname;
    if(needsNickname && !recovering && activeView !== 'mfa-setup') {
      view('nickname',true);
      if(!dialog.open)dialog.showModal();
    } else if (dialog.open && !recovering && activeView !== 'mfa-setup') view('profile',true);
    if (dialog.open) void loadMyApplications();
  }
  async function showAvatar() {
    const image=$('#account-avatar');
    const removeButton=$('#avatar-remove');
    image.hidden=true;
    if(navAvatar)navAvatar.hidden=true;
    $('#avatar-placeholder').hidden=false;
    if (removeButton) removeButton.disabled = true;
    if (avatarObjectUrl) { URL.revokeObjectURL(avatarObjectUrl); avatarObjectUrl=null; }
    const path=currentUser?.user_metadata?.avatar_path;
    if(!path || !currentUser?.id || !path.startsWith(currentUser.id+'/')) {
      const fallback=currentUser?.user_metadata?.avatar_url;
      if(/^https:\/\/(cdn\.discordapp\.com|lh3\.googleusercontent\.com|.*\.googleusercontent\.com)\//.test(fallback||'')) {
        image.src=fallback;image.hidden=false;$('#avatar-placeholder').hidden=true;
        if(navAvatar){navAvatar.src=fallback;navAvatar.hidden=false;}
        if(navAvatarFallback)navAvatarFallback.hidden=true;
      }
      return;
    }
    const result=await api.storage.from('vxsk-avatars').createSignedUrl(path, 900);
    if (!result.error && result.data?.signedUrl) {
      image.src=result.data.signedUrl;
      image.hidden=false;
      $('#avatar-placeholder').hidden=true;
      if(navAvatar){navAvatar.src=result.data.signedUrl;navAvatar.hidden=false;}
      if(navAvatarFallback)navAvatarFallback.hidden=true;
      if (removeButton) removeButton.disabled = false;
    }
  }
  $$('.open-account').forEach(button => button.addEventListener('click',()=>{
    const requested = button.dataset.accountView==='signup' ? 'signup':'signin';
    open(requested,button);
    if(!api) configured();
  }));
  $('#close-account').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog) dialog.close();});
  dialog.addEventListener('close',()=>{
    $$('input[type="password"]',dialog).forEach(el=>el.value='');
    $('#mfa-qr').removeAttribute('src');
    if(lastTrigger?.isConnected) lastTrigger.focus();
  });
  $$('[data-switch]').forEach(button=>button.addEventListener('click',()=>view(button.dataset.switch)));

  $('#signup-form').addEventListener('submit',e=>{
    e.preventDefault(); const form=e.currentTarget;
    if(!form.reportValidity()||!pwValid(form)) return;
    const email=form.elements.email.value.trim(); const password=form.elements.password.value;
    run(form.querySelector('[type="submit"]'),async()=>{
      const nickname=form.elements.nickname.value.trim();
      if(!nicknameValid(nickname))throw {publicMessage:'Choose a nickname with 3–24 letters, numbers, underscores, dots or hyphens.'};
      assert(await api.auth.signUp({email,password,options:{emailRedirectTo:new URL('./', location.href).href,data:{vxsk_nickname:nickname}}}));
      form.reset(); view('signin'); $('#signin-email').value=email;
      notify('Sign-up request accepted. Check your inbox (and spam) for an email confirmation link before signing in.','success');
    });
  });
  $('#signin-form').addEventListener('submit',e=>{
    e.preventDefault(); const form=e.currentTarget;
    if(!form.reportValidity()) return;
    run(form.querySelector('[type="submit"]'), async()=>{
      assert(await api.auth.signInWithPassword({email:form.elements.email.value.trim(),password:form.elements.password.value}));
      form.reset(); await refresh();
      notify(mfaRequired ? 'Enter the code from your authenticator app to finish sign in.' : 'Signed in successfully. Welcome to VXSK.','success');
    });
  });
  $('#forgot-form').addEventListener('submit',e=>{
    e.preventDefault();const form=e.currentTarget;
    if(!form.reportValidity()) return;
    run(form.querySelector('[type="submit"]'),async()=>{
      assert(await api.auth.resetPasswordForEmail(form.elements.email.value.trim(),{redirectTo:new URL('./', location.href).href}));
      form.reset(); notify('If this email is registered, a password reset message will arrive. Check spam too.','success');
    });
  });
  $('#reset-form').addEventListener('submit',e=>{
    e.preventDefault(); const form=e.currentTarget;
    if(!form.reportValidity()||!pwValid(form)) return;
    run(form.querySelector('[type="submit"]'),async()=>{
      if (!recovering) {notify('Use the email recovery link to reset your password.','error');return;}
      assert(await api.auth.updateUser({password:form.elements.password.value}));
      recovering=false; form.reset(); await refresh(); view(mfaRequired?'mfa-login':'profile');
      notify('Password changed successfully.','success');
    });
  });
  $('#avatar-form').addEventListener('submit',e=>{
    e.preventDefault(); const form=e.currentTarget; const file=$('#avatar-file').files?.[0];
    if(!file) {notify('Choose an image first.','error');return;}
    const accepted={ 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp' };
    if(!accepted[file.type]||file.size>10*1024*1024) {notify('Use PNG, JPG or WebP, no more than 10 MB.','error');return;}
    run(form.querySelector('[type="submit"]'),async()=>{
      if(mfaRequired||!currentUser) throw {publicMessage:'Complete sign in first.'};
      if(!cropImage)throw {publicMessage:'Wait for the avatar crop preview to load.'};
      renderCrop();
      const cropped=await saveAvatarBlob();
      const previousAvatar=currentUser.user_metadata?.avatar_path;
      const key=`${currentUser.id}/avatar-${Date.now()}.webp`;
      assert(await api.storage.from('vxsk-avatars').upload(key,cropped,{upsert:false,contentType:'image/webp'}));
      const data=assert(await api.auth.updateUser({data:{avatar_path:key}}));
      currentUser=data.user; form.reset(); cropImage=null;$('#avatar-editor').hidden=true;
      if(cropImageUrl){URL.revokeObjectURL(cropImageUrl);cropImageUrl=null;}
      await showAvatar();
      if (previousAvatar?.startsWith(currentUser.id+'/') && previousAvatar !== key) {
        await api.storage.from('vxsk-avatars').remove([previousAvatar]).catch(()=>{});
      }
      notify('Avatar saved successfully.','success');
    });
  });
  $('#avatar-remove')?.addEventListener('click',e=>run(e.currentTarget, async()=>{
    if(mfaRequired||!currentUser) throw {publicMessage:'Complete sign in first.'};
    const avatarPath=currentUser.user_metadata?.avatar_path;
    if(!avatarPath || !avatarPath.startsWith(currentUser.id+'/')) {notify('No avatar to remove.','error');return;}
    await api.storage.from('vxsk-avatars').remove([avatarPath]).catch(()=>{});
    const data=assert(await api.auth.updateUser({data:{avatar_path:null}}));
    currentUser=data.user;
    await showAvatar();
    notify('Avatar removed successfully.','success');
  }));
  $('#mfa-start').addEventListener('click',e=>run(e.currentTarget,async()=>{
    if(mfaRequired) throw {publicMessage:'Complete sign in first.'};
    const info=assert(await api.auth.mfa.enroll({factorType:'totp',friendlyName:'VXSK-EVENTS',issuer:'VXSK-EVENTS'}));
    pendingFactor=info.id;
    $('#mfa-qr').src=info.totp.qr_code;
    view('mfa-setup');
    notify('Scan the QR code privately and enter the 6-digit code to activate 2FA.','success');
  }));
  $('#mfa-setup-form').addEventListener('submit',e=>{
    e.preventDefault();const form=e.currentTarget;
    if(!form.reportValidity()||!pendingFactor) return;
    run(form.querySelector('[type="submit"]'),async()=>{
      assert(await api.auth.mfa.challengeAndVerify({factorId:pendingFactor,code:$('#mfa-setup-code').value.trim()}));
      pendingFactor=null; $('#mfa-qr').removeAttribute('src'); form.reset();
      await refresh();view('profile');
      notify('Two-step verification is ON. Future sign-ins will require your authenticator code.','success');
    });
  });
  $('#mfa-cancel').addEventListener('click',async()=>{
    if(pendingFactor){ await api?.auth.mfa.unenroll({factorId:pendingFactor}).catch(()=>{}); pendingFactor=null; }
    $('#mfa-qr').removeAttribute('src');view('profile');
  });
  $('#mfa-login-form').addEventListener('submit',e=>{
    e.preventDefault(); const form=e.currentTarget;
    if(!form.reportValidity()) return;
    run(form.querySelector('[type="submit"]'),async()=>{
      const factors=assert(await api.auth.mfa.listFactors());
      const factor=factors.totp?.find(f=>f.status==='verified');
      if(!factor) throw {publicMessage:'No verified authenticator found. Contact VXSK support.'};
      assert(await api.auth.mfa.challengeAndVerify({factorId:factor.id,code:$('#mfa-login-code').value.trim()}));
      form.reset();await refresh();view('profile');
      notify('Two-step verification successful.','success');
    });
  });
  $('#mfa-remove').addEventListener('click',e=>run(e.currentTarget,async()=>{
    if(!verifiedFactor) return;
    if(!confirm('Disable two-step verification on this account?')) return;
    assert(await api.auth.mfa.unenroll({factorId:verifiedFactor.id}));
    await refresh();notify('Two-step verification disabled.','success');
  }));
  async function signout() {
    if(!configured())return;
    try {assert(await api.auth.signOut());$('#account-staff-link').hidden=true;currentUser=null;recovering=false;mfaRequired=false;clearMyApplications();view('signin');notify('Signed out of VXSK.','success');resetNav();}
    catch(_){notify('Could not sign out. Try again.','error');}
  }
  $('#account-logout').addEventListener('click',signout);
  $('#mfa-login-logout').addEventListener('click',signout);
  $('#account-register').addEventListener('click',()=>{dialog.close();$('#register')?.scrollIntoView({behavior:'smooth'});});

  if(api){
    // Never await Supabase API calls inside onAuthStateChange to avoid auth locks.
    api.auth.onAuthStateChange((event,session)=>{
      setTimeout(()=>window.dispatchEvent(new Event('vxsk:auth-change')),0);
      if(event==='PASSWORD_RECOVERY'){
        recovering=true;currentUser=session?.user||null;view('reset');
        if(!dialog.open)dialog.showModal();notify('Recovery link verified. Choose a new password.','success');
      } else if(event==='SIGNED_OUT'){
        recovering=false;currentUser=null;verifiedFactor=null;mfaRequired=false;clearMyApplications();
        resetNav();
      } else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED'){
        setTimeout(()=>refresh().catch(()=>{}),0);
      }
    });
    // A delay-free initial state check; session restoration is handled by the SDK.
    refresh().catch(()=>{ if(dialog.open)notify('Unable to load account. Please reload.','error'); });
  }
})();
