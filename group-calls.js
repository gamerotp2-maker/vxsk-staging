'use strict';
/* VXSK 12.8.26: independently usable camera, mic, screen and resilient mesh calls. Each peer has
   independently negotiated microphone, camera, screen video and screen audio.
   Group signaling remains scoped to active accepted group members in Supabase. */
(()=>{
  const $=id=>document.getElementById(id);
  const panel=$('vxsk-group-call-panel');if(!panel)return;
  const members=$('vxsk-group-call-members'),shares=$('vxsk-group-shares');
  const status=$('vxsk-group-call-status'),micBtn=$('vxsk-group-call-mute'),camBtn=$('vxsk-group-call-camera');
  const shareBtn=$('vxsk-group-call-share'),playBtn=$('vxsk-group-call-play-audio'),dock=$('vxsk-group-call-dock');
  let servers=window.VXSKCallNetwork?.STUN||[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302']}];
  let hasTurn=false,latencyTimer=null,latencyBusy=false;
  const latencyBadge=$('vxsk-group-call-latency');
  const api=()=>window.VXSKAuth?.client;
  const node=(tag,label,cls)=>{const n=document.createElement(tag);if(label!=null)n.textContent=label;if(cls)n.className=cls;return n;};
  let room=null,session=null,user=null,local=null,shareStream=null,sharingVideo=null,sharingAudio=null;
  let peers=new Map(),cursor=0,updating=false,joining=false,timer=null,liveMedium='audio',epoch=0;
  const icons={
    'microphone':'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/>',
    'microphone-off':'<path d="m3 3 18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 9V5a3 3 0 0 0-5.2-2M5 10a7 7 0 0 0 12 4.9M19 10a7 7 0 0 1-1.3 4.1M12 17v5m-4 0h8"/>',
    'camera':'<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    'camera-off':'<path d="m3 3 18 18M10 6h4a2 2 0 0 1 2 2v2l5-3v10l-2.8-1.7M16 16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8c0-.6.2-1.1.6-1.5"/>',
    'screen':'<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8m-4-4v4m0-15v7m-3-3 3 3 3-3"/>',
    'screen-stop':'<rect x="3" y="4" width="18" height="14" rx="2"/><rect x="9" y="8" width="6" height="6" rx="1"/><path d="M8 22h8m-4-4v4"/>',
    'leave':'<path d="M10 17l5-5-5-5m5 5H3M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/>',
    'sound':'<path d="M9 9H5v6h4l5 4V5L9 9Zm8-1a6 6 0 0 1 0 8"/>',
    'sound-off':'<path d="M9 9H5v6h4l5 4V5l-5 4Zm8 0 5 6m0-6-5 6"/>'
  };
  function buttonLabel(button,icon,label){
    if(!button)return;
    const svg='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+icons[icon]+'</svg>';
    button.replaceChildren();button.insertAdjacentHTML('afterbegin',svg);
    const t=node('span',label);button.append(t);
    button.setAttribute('aria-label',label);
  }
  function stateChanged(){for(const p of peers.values())void announce(p);}

  function mediaState(){
    const camera=local?.getVideoTracks().some(t=>t.readyState==='live'&&t.enabled)===true;
    const micMuted=!local?.getAudioTracks().some(t=>t.readyState==='live'&&t.enabled);
    return {vxskMediaState:true,camera,micMuted,screen:!!sharingVideo&&sharingVideo.readyState==='live',audio:!!sharingAudio&&sharingAudio.readyState==='live'};
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
  async function refreshLatency(){
    if(latencyBusy||!latencyBadge)return;
    const current=[...peers.values()].filter(p=>p.pc.connectionState==='connected');
    if(!room||!current.length){latencyBadge.textContent='PING — ms';latencyBadge.title='Waiting for participant media';return;}
    latencyBusy=true;
    try{
      const values=await Promise.all(current.map(p=>window.VXSKCallNetwork?.connectionStats(p.pc)));
      if(!room)return;
      const measurements=values.map(v=>v?.ms).filter(v=>Number.isInteger(v));
      const average=measurements.length?Math.round(measurements.reduce((a,b)=>a+b,0)/measurements.length):null;
      latencyBadge.textContent=average===null?'PING — ms':'PING '+average+' ms';
      latencyBadge.title='Average WebRTC round-trip latency to connected participants ('+measurements.length+' measured)';
      latencyBadge.dataset.path=values.some(v=>v?.path==='relay')?'relay':'direct';
    }catch(_){latencyBadge.textContent='PING — ms';}finally{latencyBusy=false;}
  }
  function stopLatency(){if(latencyTimer){clearInterval(latencyTimer);latencyTimer=null;}if(latencyBadge){latencyBadge.textContent='PING — ms';latencyBadge.dataset.path='unknown';}}
  async function restartPeer(p){
    if(!room||!p||peers.get(p.id)!==p||p.pc.signalingState==='closed'||p.restarting)return;
    p.restarting=true;
    try{
      const result=await window.VXSKCallNetwork?.ice(api(),{kind:'group',id:room});
      if(!room||peers.get(p.id)!==p)return;
      if(result?.relay){servers=result.servers;hasTurn=true;for(const peer of peers.values())peer.pc.setConfiguration({iceServers:servers});}
      if(user.id<p.id){
        if(p.pc.signalingState==='stable')await offer(p,true,true);
        else void send(p,'ice',{vxskIceRestart:true});
      }else void send(p,'ice',{vxskIceRestart:true});
    }catch(_){/* Retain the media connection for transient ICE failures. */}
    finally{p.restarting=false;}
  }

  async function rpc(method,args){const c=api();if(!c)throw Error('Sign in before joining a call.');const {data,error}=await c.rpc(method,args);if(error){console.warn('VXSK group-call RPC',method,error.code||'error');throw Error(error.code==='PGRST202'?'Run V12.8.22 group-call migration in STAGING.':'Group call connection or permission error.');}return data;}
  function open(){dock.hidden=true;panel.hidden=false;try{if(!panel.open)panel.showModal();}catch(_){panel.hidden=false;}}
  function minimized(){if(!room)return;void closeFullscreen();if(panel.open)panel.close();panel.hidden=true;dock.hidden=false;}
  function closeFullscreen(){const el=document.fullscreenElement;if(el?.closest?.('#vxsk-group-shares')||el?.id==='vxsk-group-shares')void document.exitFullscreen().catch(()=>{});shares.querySelectorAll('.vxsk-share-theater').forEach(x=>x.classList.remove('vxsk-share-theater'));}
  function safeMedia(stream){stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});}
  function addAvatar(holder,id,name,path){holder.textContent=(name||'V').trim().slice(0,1).toUpperCase();holder.classList.add('vxsk-participant-avatar');if(id){if(path)void window.VXSKCommunity?.addVisibleAvatar?.(holder,id,path);else void window.VXSKCommunity?.addFriendAvatar?.(holder,id);}}
  function groupTile(id,name,isMe=false,avatarPath=null){
    const card=node('article',null,'vxsk-group-peer is-audio');card.dataset.user=id;
    const vid=node('video');vid.autoplay=true;vid.playsInline=true;vid.muted=true;vid.setAttribute('aria-label',isMe?'Your camera preview':'Participant camera');
    const placeholder=node('div',null,'vxsk-member-placeholder');addAvatar(placeholder,isMe?null:id,name,avatarPath);
    const label=node('strong',(isMe?'YOU · ':'')+(name||'VXSK PLAYER'));
    const state=node('small',isMe?'LOCAL':'CONNECTING…');
    const indicators=node('div',null,'vxsk-participant-indicators');
    const muted=node('span','🔇 MIC MUTED','vxsk-muted-indicator');
    muted.title=isMe?'Your microphone is muted':'This participant has muted their microphone';
    muted.hidden=true;muted.setAttribute('aria-label',muted.title);indicators.append(muted);
    const camStatus=node('span','CAMERA OFF','vxsk-camera-indicator');camStatus.hidden=true;indicators.append(camStatus);
    const controls=node('div',null,'vxsk-participant-controls');
    const muteBtn=node('button','MUTE USER','vxsk-mini-control');muteBtn.type='button';muteBtn.title='Mute this person only for you';
    if(isMe)muteBtn.hidden=true;
    card.append(vid,placeholder,indicators,label,state,controls);if(!isMe)controls.append(muteBtn);
    members.append(card);return {card,vid,placeholder,label,state,muteBtn,controls,muted,camStatus};
  }
  function makeShare(id,name,isMe=false){
    const card=node('article',null,'vxsk-share-card');card.dataset.user=id;
    const label=node('span',(isMe?'YOU':name||'FRIEND')+' · SCREEN','vxsk-screen-label');
    const vid=node('video');vid.autoplay=true;vid.playsInline=true;vid.muted=true;
    const waiting=node('div','Connecting screen…','vxsk-share-waiting');
    vid.addEventListener('playing',()=>{waiting.hidden=true;card.classList.add('has-frames');});
    vid.addEventListener('waiting',()=>{if(!vid.videoWidth)waiting.hidden=false;});
    const tools=node('div',null,'vxsk-share-tools');
    const sound=node('button','MUTE SHARE SOUND','vxsk-mini-control');sound.type='button';sound.title='Mute just this screen share';sound.setAttribute('aria-pressed','false');
    const full=node('button','FULLSCREEN ⛶','vxsk-mini-control');full.type='button';full.title='Enlarge this screen share';
    tools.append(sound,full);card.append(vid,waiting,label,tools);
    full.addEventListener('click',async()=>{
      if(document.fullscreenElement===card||card.classList.contains('vxsk-share-theater')){
        card.classList.remove('vxsk-share-theater');if(document.fullscreenElement===card)try{await document.exitFullscreen();}catch(_){}return;
      }
      try{if(card.requestFullscreen)await card.requestFullscreen();else throw Error('not supported');}
      catch(_){card.classList.add('vxsk-share-theater');}
    });
    shares.append(card);
    return {card,vid,sound,full,waiting,track:null};
  }
  function syncShareGrid(){shares.hidden=!shares.children.length;shares.dataset.count=String(shares.children.length);$('vxsk-group-share-count').textContent=shares.children.length+' / 4 SHARES';}
  function setRemoteShare(p,on){
    if(!on){if(p.shareUi){p.shareUi.vid.srcObject=null;p.shareUi.card.remove();p.shareUi=null;syncShareGrid();}return;}
    // Show a waiting tile as soon as the sender announces a share. A missing
    // RTP stream no longer looks as though nothing was shared.
    if(!p.shareUi){
      p.shareUi=makeShare(p.id,p.name);
      p.shareUi.sound.addEventListener('click',()=>{
        p.muteShare=!p.muteShare;p.shareUi.sound.textContent=p.muteShare?'UNMUTE SHARE SOUND':'MUTE SHARE SOUND';
        p.shareUi.sound.setAttribute('aria-pressed',String(p.muteShare));p.shareSound.muted=p.muteShare;
      });
    }
    const track=p.screenTrack;
    // Crucial: do not reassign srcObject on each metadata poll. Replacing a
    // MediaStream repeatedly interrupts playback and can make video disappear.
    if(track&&track.readyState==='live'&&p.shareUi.track!==track){
      p.shareUi.track=track;
      p.shareUi.vid.srcObject=new MediaStream([track]);
      void play(p.shareUi.vid);
    }
    if(!track||track.muted){
      p.shareUi.waiting.textContent=track?'Receiving screen video…':'Waiting for screen stream…';
      if(!p.shareUi.card.classList.contains('has-frames'))p.shareUi.waiting.hidden=false;
    }
    syncShareGrid();
  }
  function setLocalShare(on){
    const existing=shares.querySelector('[data-user="self"]');if(!on){existing?.remove();syncShareGrid();return;}
    const ui=existing?null:makeShare('self','YOU',true);if(ui){ui.track=sharingVideo;ui.vid.srcObject=new MediaStream([sharingVideo]);void ui.vid.play().catch(()=>{});}
    if(ui)ui.sound.hidden=true;syncShareGrid();
  }
  function soundBlocked(){playBtn.hidden=false;say('Call live — tap PLAY SOUND if your browser blocks incoming audio.');}
  async function play(el){if(!el?.srcObject)return;try{await el.play();}catch(e){if(e.name==='NotAllowedError')soundBlocked();}}
  function updateCamera(){
    const t=local?.getVideoTracks().find(t=>t.readyState==='live');
    buttonLabel(camBtn,t?.enabled?'camera-off':'camera',t?.enabled?'CAMERA OFF':'CAMERA ON');
    camBtn.disabled=!room;
    const own=members.querySelector('.vxsk-group-peer.is-local');
    if(own){
      own.classList.toggle('is-audio',!t?.enabled);
      own.querySelector('.vxsk-camera-indicator').hidden=Boolean(t?.enabled);
    }
  }
  function updateMicrophone(){
    const muted=mediaState().micMuted;
    buttonLabel(micBtn,muted?'microphone':'microphone-off',muted?'UNMUTE MICROPHONE':'MUTE MICROPHONE');
    const own=members.querySelector('.vxsk-group-peer.is-local');
    if(own){
      const indicator=own.querySelector('.vxsk-muted-indicator');
      if(indicator)indicator.hidden=!muted;
      own.classList.toggle('mic-muted',muted);
    }
  }

  async function ensureCamera(){
    if(!room||!local)return;
    const t=local.getVideoTracks()[0];
    if(t&&t.readyState==='live'){
      t.enabled=!t.enabled;
      for(const p of peers.values())void send(p,'ice',{vxskCamera:true,enabled:t.enabled});
      updateCamera();stateChanged();return;
    }
    const token=epoch;
    let extra;try{extra=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:360}},audio:false});}
    catch(e){say('Camera unavailable or permission refused. Microphone call continues.');return;}
    const track=extra.getVideoTracks()[0];if(!room||epoch!==token||!track){safeMedia(extra);return;}
    const failures=await Promise.all([...peers.values()].filter(p=>p.cameraSender).map(p=>p.cameraSender.replaceTrack(track).then(()=>false).catch(()=>true)));
    if(failures.some(Boolean))say('One camera peer needs recovery; audio is still active.');
    local.getVideoTracks().filter(t=>t.readyState!=='live').forEach(t=>local.removeTrack(t));
    local.addTrack(track);track.enabled=true;const own=members.querySelector('.vxsk-group-peer.is-local');
    if(own){const video=own.querySelector('video');video.srcObject=new MediaStream([track]);void video.play().catch(()=>{});own.classList.remove('is-audio');}
    track.onended=()=>{
      if(!local?.getVideoTracks().includes(track))return;
      local.removeTrack(track);
      for(const p of peers.values())if(p.cameraSender)void p.cameraSender.replaceTrack(null).catch(()=>{});
      if(own){own.querySelector('video').srcObject=null;own.classList.add('is-audio');}
      updateCamera();stateChanged();
    };
    updateCamera();stateChanged();
  }
  function killPeer(id){const p=peers.get(id);if(!p)return;peers.delete(id);
    if(p.recoveryTimer)clearTimeout(p.recoveryTimer);
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
    // Only the deterministic offerer allocates transceivers upfront. The
    // answerer must re-use those created by setRemoteDescription(offer).
    // Pre-creating all four on both ends generated seven transceivers in
    // Chromium and left the answerer's screen sender unnegotiated.
    const isOfferer=user.id<id;
    let cameraSender=null,shareSender=null,shareAudioSender=null;
    if(isOfferer){
      const audio=local.getAudioTracks()[0];
      if(audio)pc.addTrack(audio,local);else pc.addTransceiver('audio',{direction:'sendrecv'});
      const camera=local.getVideoTracks().find(t=>t.readyState==='live'&&t.enabled);
      cameraSender=camera?pc.addTrack(camera,local):pc.addTransceiver('video',{direction:'sendrecv'}).sender;
      shareSender=pc.addTransceiver('video',{direction:'sendrecv'}).sender;
      shareAudioSender=pc.addTransceiver('audio',{direction:'sendrecv'}).sender;
    }
    const micSound=node('audio'),shareSound=node('audio');micSound.autoplay=shareSound.autoplay=true;
    ui.card.append(micSound,shareSound);
    p={id,name,session:sid,pc,ui,ice:[],cameraSender,shareSender,shareAudioSender,micSound,shareSound,
      screenTrack:null,screenActive:false,shareUi:null,muteMic:false,muteShare:false,remoteMicMuted:false,cameraOff:true,offered:false,
      sendQueue:Promise.resolve(),lastStateAt:0,lastOfferAt:0,offerAttempts:0,refreshTimer:null,recoveryTimer:null,recoveryAttempts:0,restarting:false};peers.set(id,p);
    // Attach existing shares BEFORE creating a new offer; late joiners receive
    // active screen tracks in the initial negotiation, not an empty sender.
    try{
      if(sharingVideo&&shareSender)await shareSender.replaceTrack(sharingVideo);
      if(sharingAudio&&shareAudioSender)await shareAudioSender.replaceTrack(sharingAudio);
    }catch(_){ui.state.textContent='MEDIA RECOVERY';}
    ui.muteBtn.addEventListener('click',()=>{p.muteMic=!p.muteMic;p.micSound.muted=p.muteMic;
      ui.muteBtn.textContent=p.muteMic?'UNMUTE USER':'MUTE USER';ui.muteBtn.setAttribute('aria-pressed',String(p.muteMic));});
    const applyRemoteState=()=>{
      ui.muted.hidden=!p.remoteMicMuted;
      ui.camStatus.hidden=!p.cameraOff;
      ui.card.classList.toggle('mic-muted',p.remoteMicMuted);
      p.updateCameraTile?.();
    };
    p.applyRemoteState=applyRemoteState;
    applyRemoteState();
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
      if(pc.connectionState==='connected'){p.recoveryAttempts=0;if(p.recoveryTimer)clearTimeout(p.recoveryTimer);p.recoveryTimer=null;}
      else if(['failed','disconnected'].includes(pc.connectionState)&&!p.recoveryTimer&&p.recoveryAttempts<3){
        p.recoveryTimer=setTimeout(()=>{p.recoveryTimer=null;if(peers.get(id)!==p||!['failed','disconnected'].includes(pc.connectionState))return;p.recoveryAttempts++;void restartPeer(p);},pc.connectionState==='failed'?1500:8000);
      }
      const s=pc.connectionState;ui.state.textContent=s==='connected'?'CONNECTED':s==='failed'?'CONNECTION FAILED':s.toUpperCase();
      if(s==='connected')void announce(p);
      if(s==='failed')say('A peer connection failed. TURN relay may be needed on restrictive networks.');
    };
    // Deterministic offerer: no simultaneous offer glare on room joins.
    if(user.id<id)void offer(p);
    return p;
  }
  async function prepareAnswerTracks(p){
    // Called after applying the remote offer and BEFORE createAnswer().
    // Re-use m-lines from the offer so both directions get the same stable
    // order: mic, camera, screen, screen audio. No orphan transceivers.
    const trans=p.pc.getTransceivers();
    if(trans.length<4||trans[0].receiver.track.kind!=='audio'||
        trans[1].receiver.track.kind!=='video'||
        trans[2].receiver.track.kind!=='video'||
        trans[3].receiver.track.kind!=='audio')throw Error('Unexpected remote media channel order');
    for(const t of trans.slice(0,4))t.direction='sendrecv';
    p.cameraSender=trans[1].sender;
    p.shareSender=trans[2].sender;
    p.shareAudioSender=trans[3].sender;
    await Promise.all([
      trans[0].sender.replaceTrack(local.getAudioTracks()[0]||null),
      p.cameraSender.replaceTrack(local.getVideoTracks().find(t=>t.readyState==='live'&&t.enabled)||null),
      p.shareSender.replaceTrack(sharingVideo||null),
      p.shareAudioSender.replaceTrack(sharingAudio||null)
    ]);
  }
  async function offer(p,refresh=false,iceRestart=false){
    if(!room||peers.get(p.id)!==p||user.id>=p.id||(!refresh&&p.offered)||p.pc.signalingState!=='stable')return;
    p.offered=true;
    try{
      await p.pc.setLocalDescription(await p.pc.createOffer(iceRestart?{iceRestart:true}:undefined));
      p.lastOfferAt=Date.now();p.offerAttempts=0;
      if(!await send(p,'offer',p.pc.localDescription.toJSON()))throw Error('offer rejected');
      await announce(p);
    }catch(_){p.offered=false;p.ui.state.textContent='SIGNAL FAILED';}
  }
  async function messages(events){for(const item of events||[]){const id=Number(item.id);if(!Number.isSafeInteger(id)||id<=cursor)continue;
    const p=peers.get(item.sender);if(!p||p.session!==item.sender_session){cursor=id;continue;}
    try{
      if(item.kind==='ice'){
        if(item.body?.vxskIceRestart===true){if(user.id<p.id)void restartPeer(p);}
        else if(item.body?.vxskRefresh===true){if(user.id<p.id)refresh(p);}
        else if(item.body?.vxskMediaState===true){
          p.cameraOff=item.body.camera!==true;
          p.remoteMicMuted=item.body.micMuted===true;
          p.screenActive=item.body.screen===true;
          p.applyRemoteState?.();setRemoteShare(p,p.screenActive);
        }
        else if(item.body?.vxskCamera){p.cameraOff=item.body.enabled!==true;p.applyRemoteState?.();}
        else if(item.body?.vxskScreen){p.screenActive=item.body.active===true;setRemoteShare(p,p.screenActive);}
        else await addCandidate(p,item.body);
      }else if(item.kind==='offer'&&item.body?.type==='offer'){
        if(p.pc.signalingState!=='stable')break;
        await p.pc.setRemoteDescription(item.body);await flush(p);
        await prepareAnswerTracks(p);
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
        if(p.pc.connectionState==='connected'&&Date.now()-p.lastStateAt>6500)void announce(p);
        // Re-deliver an unanswered SDP offer: a newcomer might not yet have
        // appeared in the other client's roster when our first message landed.
        if(user.id<p.id&&p.pc.signalingState==='have-local-offer'&&
           Date.now()-p.lastOfferAt>9500&&p.offerAttempts<3){
          p.offerAttempts++;p.lastOfferAt=Date.now();void send(p,'offer',p.pc.localDescription.toJSON());
        }
      }
      const connections=[...peers.values()].map(p=>p.pc.connectionState);
      const failed=connections.some(s=>s==='failed');
      const connected=connections.filter(s=>s==='connected').length;
      if(failed)say('MEDIA CONNECTION FAILED · Check network or TURN relay (group call remains open).');
      else if(peers.size>0&&connected<peers.size)say('CONNECTING MEDIA · '+connected+' / '+peers.size+' peers connected · '+shares.children.length+' SHARES');
      else say('LIVE · '+(peers.size+1)+' / 4 MEMBERS · '+shares.children.length+' ACTIVE SHARES');
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
      const iceConfig=await window.VXSKCallNetwork?.ice(c,{kind:'group',id:group});
      if(iceConfig?.relay){servers=iceConfig.servers;hasTurn=true;}
      else {servers=window.VXSKCallNetwork?.STUN||servers;hasTurn=false;}

      $('vxsk-group-call-title').textContent=(name||'SQUAD')+' · '+medium.toUpperCase()+' GROUP CALL';
      members.replaceChildren();shares.replaceChildren();syncShareGrid();const own=groupTile('self',$('nav-nickname')?.textContent?.trim()||'PLAYER',true);own.card.classList.add('is-local');
      own.label.textContent='YOU';own.state.textContent='LOCAL';
      const myPhoto=$('nav-avatar');
      if(myPhoto&&!myPhoto.hidden&&myPhoto.src){
        const image=new Image();image.alt='';image.src=myPhoto.src;
        image.onerror=()=>image.remove();own.placeholder.append(image);
      }
      const myNick=$('nav-nickname')?.textContent?.trim();
      if(myNick)own.label.textContent='YOU · '+myNick;
      if(local.getVideoTracks().length){own.vid.srcObject=new MediaStream(local.getVideoTracks());own.card.classList.remove('is-audio');void own.vid.play().catch(()=>{});}
      camBtn.hidden=false;updateMicrophone();updateCamera();buttonLabel(shareBtn,'screen','SHARE SCREEN');buttonLabel(playBtn,'sound','PLAY GROUP SOUND');buttonLabel($('vxsk-group-call-end'),'leave','LEAVE GROUP CALL');playBtn.hidden=true;
      dock.querySelector('#vxsk-group-call-dock-title').textContent=name||'GROUP CALL';open();
      await poll();timer=setInterval(()=>void poll(),2200);
      if(!latencyTimer){void refreshLatency();latencyTimer=setInterval(()=>{if(!document.hidden)void refreshLatency();},4000);}
      say('Connected to your squad. Each member can share one screen.');
      if(medium==='video')void ensureCamera();
    }catch(e){const f=$('vxsk-group-feedback');if(f)f.textContent=e.message||'Unable to join call.';
      if(!room){safeMedia(local);local=null;say(e.message||'Unable to join call.');}
    }finally{joining=false;}
  }
  async function stopShare(){if(!shareStream)return;
    const old=shareStream;shareStream=null;sharingVideo=null;sharingAudio=null;safeMedia(old);
    await Promise.all([...peers.values()].map(async p=>{
      if(p.shareSender)await p.shareSender.replaceTrack(null).catch(()=>{});if(p.shareAudioSender)await p.shareAudioSender.replaceTrack(null).catch(()=>{});
      await send(p,'ice',{vxskScreen:true,active:false,audio:false});
    }));setLocalShare(false);buttonLabel(shareBtn,'screen','SHARE SCREEN');
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
        try{if(p.shareSender)await p.shareSender.replaceTrack(vid);if(aud&&p.shareAudioSender)await p.shareAudioSender.replaceTrack(aud);}
        catch(_){return false;}
        return send(p,'ice',{vxskScreen:true,active:true,audio:!!aud});
      }));
      vid.onended=()=>{if(sharingVideo===vid)void stopShare();};
      if(aud)aud.onended=()=>{if(sharingAudio===aud){sharingAudio=null;for(const p of peers.values())if(p.shareAudioSender)void p.shareAudioSender.replaceTrack(null).catch(()=>{});}};
      setLocalShare(true);buttonLabel(shareBtn,'screen-stop','STOP SHARING');
      refreshAll();
      say(aud?'Sharing screen + supported tab sound.':'Screen shared; for sound, select Share tab audio where available.');
      if(outcomes.some(x=>!x))say('Share started, but one peer may be reconnecting.');
    }catch(e){if(stream&&shareStream!==stream)safeMedia(stream);if(e.name!=='NotAllowedError')say('Could not share this screen; try a browser tab.');}
  }
  async function leave(){if(!room&&!local)return;clearInterval(timer);timer=null;stopLatency();
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
    const on=tracks.some(t=>t.enabled);tracks.forEach(t=>t.enabled=!on);
    updateMicrophone();stateChanged();
  });
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
