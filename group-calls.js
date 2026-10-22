'use strict';
/* VXSK 12.8.24: independently usable camera, mic, screen and resilient mesh calls. Each peer has
   independently negotiated microphone, camera, screen video and screen audio.
   Group signaling remains scoped to active accepted group members in Supabase. */
(()=>{
  const $=id=>document.getElementById(id);
  const panel=$('vxsk-group-call-panel');if(!panel)return;
  const members=$('vxsk-group-call-members'),shares=$('vxsk-group-shares');
  const status=$('vxsk-group-call-status'),micBtn=$('vxsk-group-call-mute'),camBtn=$('vxsk-group-call-camera');
  const shareBtn=$('vxsk-group-call-share'),playBtn=$('vxsk-group-call-play-audio'),dock=$('vxsk-group-call-dock');
  const servers=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302']}];
  const api=()=>window.VXSKAuth?.client;
  const node=(tag,label,cls)=>{const n=document.createElement(tag);if(label!=null)n.textContent=label;if(cls)n.className=cls;return n;};
  let room=null,session=null,user=null,local=null,shareStream=null,sharingVideo=null,sharingAudio=null;
  let peers=new Map(),cursor=0,updating=false,joining=false,timer=null,liveMedium='audio',epoch=0;
  function mediaState(){
    const camera=local?.getVideoTracks().some(t=>t.readyState==='live'&&t.enabled)===true;
    return {vxskMediaState:true,camera,screen:!!sharingVideo,audio:!!sharingAudio};
  }
  async function announce(p){
    if(!p||!peers.has(p.id)||!room)return;
    p.lastStateAt=Date.now();
    await send(p,'ice',mediaState());
  }
  function refresh(p){
    if(!p||!peers.has(p.id)||!room)return;
    if(user.id<p.id){
      if(p.refreshTimer)clearTimeout(p.refreshTimer);
      p.refreshTimer=setTimeout(()=>{p.refreshTimer=null;void offer(p,true);},500);
    }else void send(p,'ice',{vxskRefresh:true});
  }
  function refreshAll(){for(const p of peers.values()){void announce(p);refresh(p);}}

  const say=s=>{status.textContent=s;};
  async function rpc(method,args){const c=api();if(!c)throw Error('Sign in before joining a call.');const {data,error}=await c.rpc(method,args);if(error){console.warn('VXSK group-call RPC',method,error.code||'error');throw Error(error.code==='PGRST202'?'Run V12.8.22 group-call migration in STAGING.':'Group call connection or permission error.');}return data;}
  function open(){dock.hidden=true;panel.hidden=false;try{if(!panel.open)panel.showModal();}catch(_){panel.hidden=false;}}
  function minimized(){if(!room)return;void closeFullscreen();if(panel.open)panel.close();panel.hidden=true;dock.hidden=false;}
  function closeFullscreen(){const el=document.fullscreenElement;if(el?.closest?.('#vxsk-group-shares')||el?.id==='vxsk-group-shares')void document.exitFullscreen().catch(()=>{});shares.querySelectorAll('.vxsk-share-theater').forEach(x=>x.classList.remove('vxsk-share-theater'));}
  function safeMedia(stream){stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});}
  function addAvatar(holder,id,name,path){holder.textContent=(name||'V').trim().slice(0,1).toUpperCase();holder.classList.add('vxsk-participant-avatar');if(id){if(path)void window.VXSKCommunity?.addVisibleAvatar?.(holder,id,path);else void window.VXSKCommunity?.addFriendAvatar?.(holder,id);}}
  function groupTile(id,name,isMe=false,avatarPath=null){
    const card=node('article',null,'vxsk-group-peer is-audio');card.dataset.user=id;
    const vid=node('video');vid.autoplay=true;vid.playsInline=true;vid.muted=true;
    const placeholder=node('div',null,'vxsk-member-placeholder');addAvatar(placeholder,isMe?null:id,name,avatarPath);
    const label=node('strong',(isMe?'YOU · ':'')+(name||'VXSK PLAYER'));
    const state=node('small',isMe?'LOCAL':'CONNECTING…');
    const controls=node('div',null,'vxsk-participant-controls');
    const muteBtn=node('button','MUTE USER','vxsk-mini-control');muteBtn.type='button';muteBtn.title='Mute this person only for you';
    if(isMe)muteBtn.hidden=true;
    card.append(vid,placeholder,label,state,controls);if(!isMe)controls.append(muteBtn);
    members.append(card);return {card,vid,placeholder,label,state,muteBtn,controls};
  }
  function makeShare(id,name,isMe=false){
    const card=node('article',null,'vxsk-share-card');card.dataset.user=id;
    const label=node('span',(isMe?'YOU':name||'FRIEND')+' · SCREEN','vxsk-screen-label');
    const vid=node('video');vid.autoplay=true;vid.playsInline=true;vid.muted=true;
    const tools=node('div',null,'vxsk-share-tools');
    const sound=node('button','MUTE SHARE SOUND','vxsk-mini-control');sound.type='button';sound.title='Mute just this screen share';sound.setAttribute('aria-pressed','false');
    const full=node('button','FULLSCREEN ⛶','vxsk-mini-control');full.type='button';full.title='Enlarge this screen share';
    tools.append(sound,full);card.append(vid,label,tools);
    full.addEventListener('click',async()=>{
      if(document.fullscreenElement===card||card.classList.contains('vxsk-share-theater')){
        card.classList.remove('vxsk-share-theater');if(document.fullscreenElement===card)try{await document.exitFullscreen();}catch(_){}return;
      }
      try{if(card.requestFullscreen)await card.requestFullscreen();else throw Error('not supported');}
      catch(_){card.classList.add('vxsk-share-theater');}
    });
    shares.append(card);
    return {card,vid,sound,full};
  }
  function syncShareGrid(){shares.hidden=!shares.children.length;shares.dataset.count=String(shares.children.length);$('vxsk-group-share-count').textContent=shares.children.length+' / 4 SHARES';}
  function setRemoteShare(p,on){
    if(!on){if(p.shareUi){p.shareUi.vid.srcObject=null;p.shareUi.card.remove();p.shareUi=null;syncShareGrid();}return;}
    const track=p.screenTrack;if(!track||track.readyState==='ended')return;
    if(!p.shareUi){p.shareUi=makeShare(p.id,p.name);p.shareUi.sound.addEventListener('click',()=>{
      p.muteShare=!p.muteShare;p.shareUi.sound.textContent=p.muteShare?'UNMUTE SHARE SOUND':'MUTE SHARE SOUND';
      p.shareUi.sound.setAttribute('aria-pressed',String(p.muteShare));p.shareSound.muted=p.muteShare;
    });}
    p.shareUi.vid.srcObject=new MediaStream([track]);void p.shareUi.vid.play().catch(()=>{});syncShareGrid();
  }
  function setLocalShare(on){
    const existing=shares.querySelector('[data-user="self"]');if(!on){existing?.remove();syncShareGrid();return;}
    const ui=makeShare('self','YOU',true);ui.vid.srcObject=new MediaStream([sharingVideo]);void ui.vid.play().catch(()=>{});
    ui.sound.hidden=true;syncShareGrid();
  }
  function soundBlocked(){playBtn.hidden=false;say('Call live — tap PLAY SOUND if your browser blocks incoming audio.');}
  async function play(el){if(!el?.srcObject)return;try{await el.play();}catch(e){if(e.name==='NotAllowedError')soundBlocked();}}
  function updateCamera(){const t=local?.getVideoTracks()[0];camBtn.textContent=t?.enabled?'CAMERA OFF':'CAMERA ON';camBtn.disabled=!room;}
  async function ensureCamera(){
    if(!room||!local)return;
    const t=local.getVideoTracks()[0];
    if(t&&t.readyState==='live'){
      t.enabled=!t.enabled;
      for(const p of peers.values())void send(p,'ice',{vxskCamera:true,enabled:t.enabled});
      const own=members.querySelector('.vxsk-group-peer.is-local');own?.classList.toggle('is-audio',!t.enabled);
      updateCamera();refreshAll();return;
    }
    const token=epoch;
    let extra;try{extra=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:360}},audio:false});}
    catch(e){say('Camera unavailable or permission refused. Microphone call continues.');return;}
    const track=extra.getVideoTracks()[0];if(!room||epoch!==token||!track){safeMedia(extra);return;}
    const failures=await Promise.all([...peers.values()].map(p=>p.cameraSender.replaceTrack(track).then(()=>false).catch(()=>true)));
    if(failures.some(Boolean))say('One camera peer needs recovery; audio is still active.');
    local.getVideoTracks().filter(t=>t.readyState!=='live').forEach(t=>local.removeTrack(t));
    local.addTrack(track);track.enabled=true;const own=members.querySelector('.vxsk-group-peer.is-local');
    if(own){own.vid.srcObject=new MediaStream([track]);void own.vid.play().catch(()=>{});own.card.classList.remove('is-audio');}
    track.onended=()=>{
      if(!local?.getVideoTracks().includes(track))return;
      local.removeTrack(track);
      for(const p of peers.values())void p.cameraSender.replaceTrack(null).catch(()=>{});
      if(own){own.vid.srcObject=null;own.card.classList.add('is-audio');}
      updateCamera();refreshAll();
    };
    for(const p of peers.values())void send(p,'ice',{vxskCamera:true,enabled:true});
    updateCamera();refreshAll();
  }
  function killPeer(id){const p=peers.get(id);if(!p)return;peers.delete(id);
    if(p.refreshTimer)clearTimeout(p.refreshTimer);
    try{p.pc.close();}catch(_){}p.micSound.srcObject=null;p.shareSound.srcObject=null;setRemoteShare(p,false);p.ui.card.remove();
  }
  function send(p,kind,body){
    if(!room||!session||!peers.has(p.id))return Promise.resolve(false);
    // Supabase RPCs may finish out of order. Signaling for each recipient
    // MUST preserve SDP-before-state order to prevent lost remote shares.
    const group=room,sid=session;
    const operation=()=>{
      if(!room||room!==group||session!==sid||peers.get(p.id)!==p)return false;
      return rpc('vxsk_group_call_signal',{p_group:group,p_session:sid,p_peer:p.id,p_kind:kind,p_body:body}).catch(()=>false);
    };
    const result=p.sendQueue.then(operation,operation);
    p.sendQueue=result.then(()=>{},()=>{});
    return result;
  }
  async function addCandidate(p,data){if(!data?.candidate)return;
    if(!p.pc.remoteDescription){p.ice.push(data);return;}
    try{await p.pc.addIceCandidate(new RTCIceCandidate(data));}catch(_){}
  }
  async function flush(p){for(const c of p.ice.splice(0))await addCandidate(p,c);}
  async function createPeer(id,name,sid,avatarPath=null){
    let p=peers.get(id);if(p?.session===sid)return p;if(p)killPeer(id);
    const pc=new RTCPeerConnection({iceServers:servers,bundlePolicy:'max-bundle'});
    const ui=groupTile(id,name,false,avatarPath);
    const audio=local.getAudioTracks()[0];
    if(audio)pc.addTrack(audio,local);else pc.addTransceiver('audio',{direction:'sendrecv'});
    const camera=local.getVideoTracks()[0];
    const cameraSender=camera?pc.addTrack(camera,local):pc.addTransceiver('video',{direction:'sendrecv'}).sender;
    const shareSender=pc.addTransceiver('video',{direction:'sendrecv'}).sender;
    const shareAudioSender=pc.addTransceiver('audio',{direction:'sendrecv'}).sender;
    const micSound=node('audio'),shareSound=node('audio');micSound.autoplay=shareSound.autoplay=true;
    ui.card.append(micSound,shareSound);
    p={id,name,session:sid,pc,ui,ice:[],cameraSender,shareSender,shareAudioSender,micSound,shareSound,
      screenTrack:null,screenActive:false,shareUi:null,muteMic:false,muteShare:false,cameraOff:false,offered:false,
      sendQueue:Promise.resolve(),lastStateAt:0,lastOfferAt:0,offerAttempts:0,refreshTimer:null};peers.set(id,p);
    if(sharingVideo)void shareSender.replaceTrack(sharingVideo).catch(()=>{});
    if(sharingAudio)void shareAudioSender.replaceTrack(sharingAudio).catch(()=>{});
    ui.muteBtn.addEventListener('click',()=>{p.muteMic=!p.muteMic;p.micSound.muted=p.muteMic;
      ui.muteBtn.textContent=p.muteMic?'UNMUTE USER':'MUTE USER';ui.muteBtn.setAttribute('aria-pressed',String(p.muteMic));});
    pc.ontrack=event=>{
      if(peers.get(id)!==p)return;
      const trans=pc.getTransceivers(),idx=trans.indexOf(event.transceiver);
      if(idx===0){p.micSound.srcObject=new MediaStream([event.track]);void play(p.micSound);}
      else if(idx===1){ui.vid.srcObject=new MediaStream([event.track]);
        let hideDelay=null;
        const show=()=>{
          if(event.track.muted||p.cameraOff){
            if(hideDelay)clearTimeout(hideDelay);
            hideDelay=setTimeout(()=>{if(peers.get(id)===p)ui.card.classList.add('is-audio');},1100);
          }else{
            if(hideDelay)clearTimeout(hideDelay);
            ui.card.classList.remove('is-audio');void ui.vid.play().catch(()=>{});
          }
        };
        p.updateCameraTile=show;
        event.track.addEventListener('mute',show);event.track.addEventListener('unmute',show);
        event.track.addEventListener('ended',()=>ui.card.classList.add('is-audio'));
        show();void ui.vid.play().catch(()=>{});}
      else if(idx===2){p.screenTrack=event.track;
        const changed=()=>{
          // Incoming RTP has priority over delayed metadata. A momentary
          // track.muted event must not make the share flash/disappear.
          if(!event.track.muted&&event.track.readyState==='live')p.screenActive=true;
          setRemoteShare(p,p.screenActive);
        };
        event.track.addEventListener('unmute',changed);event.track.addEventListener('mute',changed);
        event.track.addEventListener('ended',()=>{p.screenTrack=null;p.screenActive=false;setRemoteShare(p,false);});
        changed();}
      else if(idx===3){const on=()=>{p.shareSound.srcObject=new MediaStream([event.track]);p.shareSound.muted=p.muteShare;void play(p.shareSound);};
        const off=()=>{p.shareSound.srcObject=null;};event.track.addEventListener('unmute',on);event.track.addEventListener('mute',off);if(!event.track.muted)on();}
    };
    pc.onicecandidate=event=>{if(event.candidate)void send(p,'ice',event.candidate.toJSON());};
    pc.onconnectionstatechange=()=>{if(peers.get(id)!==p)return;
      const s=pc.connectionState;ui.state.textContent=s==='connected'?'CONNECTED':s==='failed'?'CONNECTION FAILED':s.toUpperCase();
      if(s==='failed')say('A peer connection failed. TURN relay may be needed on restrictive networks.');
    };
    // Deterministic offerer: no simultaneous offer glare on room joins.
    if(user.id<id)void offer(p);
    return p;
  }
  async function offer(p,refresh=false){
    if(!room||peers.get(p.id)!==p||user.id>=p.id||(!refresh&&p.offered)||p.pc.signalingState!=='stable')return;
    p.offered=true;
    try{
      await p.pc.setLocalDescription(await p.pc.createOffer());
      p.lastOfferAt=Date.now();p.offerAttempts=0;
      if(!await send(p,'offer',p.pc.localDescription.toJSON()))throw Error('offer rejected');
      await announce(p);
    }catch(_){p.offered=false;p.ui.state.textContent='SIGNAL FAILED';}
  }
  async function messages(events){for(const item of events||[]){const id=Number(item.id);if(!Number.isSafeInteger(id)||id<=cursor)continue;
    const p=peers.get(item.sender);if(!p||p.session!==item.sender_session){cursor=id;continue;}
    try{
      if(item.kind==='ice'){
        if(item.body?.vxskRefresh===true){if(user.id<p.id)refresh(p);}
        else if(item.body?.vxskMediaState===true){
          p.cameraOff=item.body.camera!==true;
          p.screenActive=item.body.screen===true;
          p.updateCameraTile?.();setRemoteShare(p,p.screenActive);
        }
        else if(item.body?.vxskCamera){p.cameraOff=item.body.enabled!==true;p.updateCameraTile?.();}
        else if(item.body?.vxskScreen){p.screenActive=item.body.active===true;setRemoteShare(p,p.screenActive);}
        else await addCandidate(p,item.body);
      }else if(item.kind==='offer'&&item.body?.type==='offer'){
        if(p.pc.signalingState!=='stable')break;
        await p.pc.setRemoteDescription(item.body);await flush(p);
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        if(!await send(p,'answer',p.pc.localDescription.toJSON()))throw Error('answer rejected');
        await announce(p);
      }else if(item.kind==='answer'&&item.body?.type==='answer'){
        if(p.pc.signalingState==='have-local-offer'){await p.pc.setRemoteDescription(item.body);await flush(p);}
      }
      cursor=id;
    }catch(_){p.ui.state.textContent='SIGNAL ERROR';break;}
  }}
  async function poll(){if(!room||!session||updating)return;updating=true;const token=epoch;
    try{
      // Heartbeat before roster/events: the group RPC validates a live session.
      const alive=await rpc('vxsk_group_call_heartbeat',{p_group:room,p_session:session});
      if(token!==epoch)return;
      if(!alive){say('Session closed. Leaving call.');void leave();return;}
      const [roster,events]=await Promise.all([rpc('vxsk_group_call_roster',{p_group:room}),rpc('vxsk_group_call_events',{p_group:room,p_session:session,p_after:cursor})]);
      if(token!==epoch)return;
      const present=new Set();for(const member of roster||[]){if(member.user_id===user.id)continue;
        present.add(member.user_id);await createPeer(member.user_id,member.nickname,member.session_id,member.avatar_path);
      }
      for(const id of [...peers.keys()])if(!present.has(id))killPeer(id);
      await messages(events);
      for(const p of peers.values()){
        if(p.pc.connectionState==='connected'&&Date.now()-p.lastStateAt>12000)void announce(p);
        // Re-deliver an unanswered SDP offer: a newcomer might not yet have
        // appeared in the other client's roster when our first message landed.
        if(user.id<p.id&&p.pc.signalingState==='have-local-offer'&&
           Date.now()-p.lastOfferAt>9500&&p.offerAttempts<3){
          p.offerAttempts++;p.lastOfferAt=Date.now();void send(p,'offer',p.pc.localDescription.toJSON());
        }
      }
      say('LIVE · '+(peers.size+1)+' / 4 MEMBERS · '+shares.children.length+' ACTIVE SHARES');
    }catch(e){if(token===epoch)say(e.message||'Reconnecting…');}finally{updating=false;}
  }
  async function join(group,medium,name){if(room){open();return;}
    if(window.VXSKCalls?.isActive?.()){const f=$('vxsk-group-feedback');if(f)f.textContent='End your private call first.';return;}
    if(joining||!['audio','video'].includes(medium)||!/^[a-f0-9-]{36}$/i.test(group))return;
    joining=true;
    try{const c=api();const {data:{user:u},error}=await c.auth.getUser();if(error||!u)throw Error('Sign in to call.');
      const {data:aal}=await c.auth.mfa.getAuthenticatorAssuranceLevel();if(aal?.currentLevel==='aal1'&&aal.nextLevel==='aal2')throw Error('Complete 2FA first.');
      if(!navigator.mediaDevices?.getUserMedia)throw Error('HTTPS and a supported browser are required.');
      user=u;liveMedium=medium;
      // Microphone first; camera is optional and individually controlled.
      local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      // Video permission is requested after joining, without holding up the
      // microphone call or requiring anyone else's camera to be available.
      const sid=await rpc('vxsk_group_call_join',{p_group:group});if(!sid)throw Error('Group call full (maximum four), already open in another tab, or unavailable.');
      session=sid;room=group;epoch++;cursor=0;peers.clear();
      $('vxsk-group-call-title').textContent=(name||'SQUAD')+' · '+medium.toUpperCase()+' GROUP CALL';
      members.replaceChildren();shares.replaceChildren();syncShareGrid();const own=groupTile('self','',true);own.card.classList.add('is-local');
      own.label.textContent='YOU';own.state.textContent='LOCAL';
      if(local.getVideoTracks().length){own.vid.srcObject=new MediaStream(local.getVideoTracks());own.card.classList.remove('is-audio');void own.vid.play().catch(()=>{});}
      micBtn.textContent='MUTE MICROPHONE';camBtn.hidden=false;updateCamera();shareBtn.textContent='SHARE SCREEN';playBtn.hidden=true;
      dock.querySelector('#vxsk-group-call-dock-title').textContent=name||'GROUP CALL';open();
      await poll();timer=setInterval(()=>void poll(),2200);
      say('Connected to your squad. Each member can share one screen.');
      if(medium==='video')void ensureCamera();
    }catch(e){const f=$('vxsk-group-feedback');if(f)f.textContent=e.message||'Unable to join call.';
      if(!room){safeMedia(local);local=null;say(e.message||'Unable to join call.');}
    }finally{joining=false;}
  }
  async function stopShare(){if(!shareStream)return;
    const old=shareStream;shareStream=null;sharingVideo=null;sharingAudio=null;safeMedia(old);
    await Promise.all([...peers.values()].map(async p=>{
      await p.shareSender.replaceTrack(null).catch(()=>{});await p.shareAudioSender.replaceTrack(null).catch(()=>{});
      await send(p,'ice',{vxskScreen:true,active:false,audio:false});
    }));setLocalShare(false);shareBtn.textContent='SHARE SCREEN';
    for(const p of peers.values())void announce(p);
  }
  async function toggleShare(){if(!room)return;if(shareStream){void stopShare();return;}
    if(!navigator.mediaDevices?.getDisplayMedia){say('Screen capture is not supported by this browser.');return;}
    const token=epoch;
    let stream;try{
      stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15,max:30}},audio:true,systemAudio:'include',surfaceSwitching:'include'});
      const vid=stream.getVideoTracks()[0],aud=stream.getAudioTracks()[0]||null;
      if(!room||epoch!==token||!vid){safeMedia(stream);return;}
      shareStream=stream;sharingVideo=vid;sharingAudio=aud;
      const outcomes=await Promise.all([...peers.values()].map(async p=>{
        try{await p.shareSender.replaceTrack(vid);if(aud)await p.shareAudioSender.replaceTrack(aud);}
        catch(_){return false;}
        return send(p,'ice',{vxskScreen:true,active:true,audio:!!aud});
      }));
      vid.onended=()=>{if(sharingVideo===vid)void stopShare();};
      if(aud)aud.onended=()=>{if(sharingAudio===aud){sharingAudio=null;for(const p of peers.values())void p.shareAudioSender.replaceTrack(null).catch(()=>{});}};
      setLocalShare(true);shareBtn.textContent='STOP SHARING';
      refreshAll();
      say(aud?'Sharing screen + supported tab sound.':'Screen shared; for sound, select Share tab audio where available.');
      if(outcomes.some(x=>!x))say('Share started, but one peer may be reconnecting.');
    }catch(e){if(stream&&shareStream!==stream)safeMedia(stream);if(e.name!=='NotAllowedError')say('Could not share this screen; try a browser tab.');}
  }
  async function leave(){if(!room&&!local)return;clearInterval(timer);timer=null;
    const id=room,sid=session;room=null;session=null;epoch++;
    await stopShare();closeFullscreen();for(const key of [...peers.keys()])killPeer(key);
    safeMedia(local);local=null;user=null;cursor=0;members.replaceChildren();shares.replaceChildren();syncShareGrid();
    if(panel.open)panel.close();panel.hidden=true;dock.hidden=true;
    if(id&&sid)void rpc('vxsk_group_call_leave',{p_group:id,p_session:sid}).catch(()=>{});
    say('Left the call. Your devices are off.');
  }
  $('vxsk-group-call-minimize').addEventListener('click',minimized);
  panel.addEventListener('cancel',e=>{e.preventDefault();minimized();});
  $('vxsk-group-call-restore').addEventListener('click',open);
  $('vxsk-group-call-dock-end').addEventListener('click',()=>void leave());
  $('vxsk-group-call-end').addEventListener('click',()=>void leave());
  micBtn.addEventListener('click',()=>{const tracks=local?.getAudioTracks()||[];if(!tracks.length)return;
    const on=tracks.some(t=>t.enabled);tracks.forEach(t=>t.enabled=!on);micBtn.textContent=on?'UNMUTE MICROPHONE':'MUTE MICROPHONE';});
  camBtn.addEventListener('click',()=>void ensureCamera());
  shareBtn.addEventListener('click',()=>void toggleShare());
  $('vxsk-group-call-grid-fullscreen').addEventListener('click',async()=>{
    if(shares.hidden)return;if(document.fullscreenElement===shares){await document.exitFullscreen().catch(()=>{});return;}
    try{await shares.requestFullscreen();}catch(_){shares.classList.toggle('vxsk-share-theater');}
  });
  playBtn.addEventListener('click',async()=>{for(const p of peers.values()){await play(p.micSound);await play(p.shareSound);}
    if([...peers.values()].every(p=>[p.micSound,p.shareSound].every(a=>!a.srcObject||!a.paused)))playBtn.hidden=true;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){shares.classList.remove('vxsk-share-theater');shares.querySelectorAll('.vxsk-share-theater').forEach(x=>x.classList.remove('vxsk-share-theater'));}});
  window.addEventListener('pagehide',()=>{if(room)void leave();});
  window.addEventListener('vxsk:auth-change',async()=>{if(room){const {data}=await api()?.auth.getUser();if(data?.user?.id!==user?.id)void leave();}});
  window.VXSKGroupCalls=Object.freeze({start:join,isActive:()=>Boolean(room)});
})();
