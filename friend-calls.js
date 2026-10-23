'use strict';
// VXSK STAGING V12.8.26: independent camera/mic/share, sender repair, and stable receiver tiles.
// Signaling is via authenticated, participant-restricted Supabase RPCs.
// No automatic camera/microphone activation; calls are never recorded here.
(() => {
  const $ = id => document.getElementById(id);
  const panel = $('vxsk-call-panel');
  if (!panel) return;
  const title = $('vxsk-call-title'), status = $('vxsk-call-status');
  const acceptButton = $('vxsk-call-accept'), declineButton = $('vxsk-call-decline');
  const muteButton = $('vxsk-call-mute'), cameraButton = $('vxsk-call-camera'), muteFriendButton=$('vxsk-call-mute-user');
  const hangupButton = $('vxsk-call-hangup'), closeButton = $('vxsk-call-close');
  const mediaBox = $('vxsk-call-video'), remoteVideo = $('vxsk-remote-video');
  const localVideo = $('vxsk-local-video'), remoteAudio = $('vxsk-remote-audio'), localMicStatus=$('vxsk-call-local-mic-state');
  const playMediaButton=$('vxsk-call-play-media');
  const remoteShareAudio=$('vxsk-share-audio'), fullStage=$('vxsk-call-stage'), fullscreenButton=$('vxsk-call-fullscreen');
  const selfPreview=$('vxsk-self-preview'),privateShares=$('vxsk-private-shares'),cameraPlaceholder=$('vxsk-call-camera-placeholder'),videoPeerAvatar=$('vxsk-video-peer-avatar'),videoPeerName=$('vxsk-video-peer-name');
  const networkButton=$('vxsk-call-network'), networkInfo=$('vxsk-call-network-info');
  const latencyBadge=$('vxsk-call-latency');
  let latencyTimer=null,latencyBusy=false;
  const screenButton=$('vxsk-call-share'),shareLabel=$('vxsk-call-share-label'),shareExit=$('vxsk-share-exit');
  let call=null, peerConnection=null, localMedia=null, remoteMedia=null, lastSignal=0;
  let collectingMedia=false, updating=false, checkingInbox=false;
  let signaling=Promise.resolve(), pendingIce=[], myId=null;
  let videoDescriptionQueued=false, videoIceBuffer=[], playNeedsGesture=false, iceReady=false;
  const dock=$('vxsk-call-dock'), dockTitle=$('vxsk-call-dock-title'), dockStatus=$('vxsk-call-dock-status');
  const ringToggle=$('vxsk-call-ringtone-toggle');
  const myAvatar=$('vxsk-call-my-avatar'),peerAvatar=$('vxsk-call-peer-avatar');
  const myName=$('vxsk-call-my-name'),peerName=$('vxsk-call-peer-name'),voices=$('vxsk-call-voices');
  let minimized=false,ringEnabled=false,playingTone='',theater=false;
  let toneRevision=0;
  // VXSK custom incoming ringtone and user-provided outgoing tone use HTML media: generally less vulnerable to
  // animation timer throttling than repeated synthesized oscillator callbacks.
  // Background sound is still controlled by the browser and operating system.
  const tones={incoming:new Audio('assets/vxsk-incoming-ring-custom.mp3'),outgoing:new Audio('assets/vxsk-outgoing-ring-custom.mp3?v=12.8.34-outgoing-2')};
  for(const el of Object.values(tones)){el.loop=true;el.preload='auto';}
  tones.incoming.volume=.9;tones.outgoing.volume=.72;
  // Direct STUN first; request scoped short-lived TURN credentials via Edge Function.
  // Without a configured relay provider, browsers cannot reliably cross strict NATs.
  const freeStunServers=window.VXSKCallNetwork?.STUN||[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302']}];
  let iceServers=freeStunServers,hasTurn=false,iceRetry=0,iceRetryTimer=null,iceRestarting=false;
  let videoSender=null,screenVideoSender=null,screenAudioSender=null,shareStream=null,shareTrack=null,shareAudioTrack=null,sharing=false,sharingAudio=false,friendScreen=false,friendSharingAudio=false;
  let peerCameraTrack=null,peerScreenTrack=null,peerCameraOff=false,friendMuted=false,shareMuted=false,shareTiles={};
  let cameraPlaceholderTimer=null;
  let callStartedAt=0;
  let mediaRefreshTimer=null, mediaRefreshBusy=false, lastStateSync=0, autoCameraRequested=false;
  function broadcastMediaState(){
    if(!call||call.state!=='accepted'||!peerConnection)return;
    const cam=localMedia?.getVideoTracks().some(t=>t.readyState==='live'&&t.enabled)===true;
    queueSignal('ice',{vxskMediaState:true,camera:cam,screen:sharing,audio:sharingAudio});
    lastStateSync=Date.now();
  }
  // Caller is the sole offerer, avoiding offer collisions. The callee may ask
  // the caller for a fresh SDP after camera/screen activation. This is a repair
  // for browsers which leave an initially trackless RTP sender muted.
  function requestMediaRefresh(){
    if(!call||call.state!=='accepted'||!peerConnection)return;
    if(call.role==='callee'){queueSignal('ice',{vxskRefresh:true});return;}
    if(mediaRefreshTimer)clearTimeout(mediaRefreshTimer);
    const id=call.id,pc=peerConnection;
    mediaRefreshTimer=setTimeout(async()=>{
      mediaRefreshTimer=null;
      if(!call||call.id!==id||peerConnection!==pc||pc.signalingState==='closed')return;
      if(mediaRefreshBusy||pc.signalingState!=='stable')return;
      mediaRefreshBusy=true;
      try{
        // Do not stop/recreate microphone streams during repair.
        await pc.setLocalDescription(await pc.createOffer());
        if(call?.id===id&&peerConnection===pc)sendDescription('offer');
      }catch(_){if(call?.id===id)setStatus('Media update delayed; your microphone call continues.');}
      finally{mediaRefreshBusy=false;}
    },450);
  }
  let meterCtx=null,meterRaf=0,localAnalyser=null,remoteAnalyser=null;
  let voiceLast=0;


  function api(){return window.VXSKAuth?.client || null;}
  function setStatus(message){status.textContent=message;if(dockStatus)dockStatus.textContent=message;}
  function display(){
    if(minimized)return;
    if(dock)dock.hidden=true;
    if(panel.hidden){panel.hidden=false;try{panel.showModal();}catch(_){panel.hidden=false;}}
  }
  function mini(){
    if(!dock)return;
    dock.hidden=!call||!minimized;
    if(call&&dockTitle)dockTitle.textContent=(call.state==='ringing'?'INCOMING / ':'LIVE / ')+call.name+' · '+call.medium.toUpperCase();
    if(call&&dockStatus)dockStatus.textContent=status.textContent||'Call ongoing';
  }
  function minimize(){
    if(!call)return;
    void exitLargeShare();
    minimized=true;
    if(panel.open)panel.close();
    panel.hidden=true;
    mini();
  }
  function restore(){
    if(!call)return;
    minimized=false;mini();display();present();
  }
  function ringtoneUi(){
    if(!ringToggle)return;
    ringToggle.setAttribute('aria-pressed',String(ringEnabled));
    ringToggle.setAttribute('aria-label',ringEnabled?'Mute call ringtone':'Enable call ringtone');
    ringToggle.title=ringEnabled?'Mute call alert sounds':'Enable call alert sounds';
    const label=ringToggle.querySelector('span');if(label)label.textContent=ringEnabled?'RING ON':'RING OFF';
  }
  async function unlockRingtone(){
    // The user's gesture on RING ON or anywhere in the page can unlock playback.
    // Do not request microphone/camera to play a ringtone.
    try{
      const audio=tones.incoming;
      if(!audio)return false;
      audio.muted=true;
      await audio.play();audio.pause();audio.currentTime=0;audio.muted=false;
      return true;
    }catch(_){tones.incoming.muted=false;return false;}
  }
  function stopTones(){
    toneRevision++;
    for(const audio of Object.values(tones)){
      try{audio.pause();audio.currentTime=0;}catch(_){}
    }
    playingTone='';
  }
  function updateRingtone(){
    const wanted=ringEnabled&&call?.state==='ringing' ? (call.role==='callee'?'incoming':'outgoing'):'';
    if(wanted===playingTone && (!wanted||!tones[wanted].paused))return;
    stopTones();
    if(!wanted)return;
    playingTone=wanted;
    const activeRevision=toneRevision;
    const requested=tones[wanted];
    try{requested.currentTime=0;}catch(_){}
    requested.play().then(()=>{
      // A delayed browser playback promise must never revive a finished call.
      if(activeRevision!==toneRevision||!call||call.state!=='ringing'||!ringEnabled||playingTone!==wanted){
        requested.pause();try{requested.currentTime=0;}catch(_){}
      }
    }).catch(()=>{
      if(activeRevision!==toneRevision||!call||call.state!=='ringing'||!ringEnabled)return;
      const text='Call sound is blocked by your browser. Click RING ON and allow sound for VXSK.';
      if(status.textContent.indexOf(text)<0)setStatus(text);
    });
  }
  async function getIceServers(){
    const instance=api();
    return await window.VXSKCallNetwork?.ice(instance,{kind:'friend',id:call?.id})
      || {servers:freeStunServers,relay:false};
  }
  async function updateLatency(){
    if(latencyBusy||!latencyBadge)return;
    if(!call||call.state!=='accepted'||!peerConnection||peerConnection.connectionState!=='connected'){
      latencyBadge.textContent='PING — ms';latencyBadge.title='Awaiting a working media connection';return;
    }
    latencyBusy=true;
    const pc=peerConnection;
    try{
      const value=await window.VXSKCallNetwork?.connectionStats(pc);
      if(pc!==peerConnection||!call)return;
      latencyBadge.textContent=value?.ms!=null?'PING '+value.ms+' ms':'PING — ms';
      latencyBadge.title=(value?.path==='relay'?'Via TURN relay':value?.path==='direct'?'Direct peer connection':'Connection type unknown')+' · WebRTC round-trip latency';
      latencyBadge.dataset.path=value?.path||'unknown';
    }catch(_){latencyBadge.textContent='PING — ms';}
    finally{latencyBusy=false;}
  }
  function startLatency(){
    if(latencyTimer)return;
    void updateLatency();latencyTimer=setInterval(()=>{if(!document.hidden)void updateLatency();},3500);
  }
  function stopLatency(){if(latencyTimer){clearInterval(latencyTimer);latencyTimer=null;}if(latencyBadge){latencyBadge.textContent='PING — ms';latencyBadge.dataset.path='unknown';}}
  async function tryIceRestart(){
    const pc=peerConnection,id=call?.id;
    if(!pc||!call||call.state!=='accepted'||pc.signalingState==='closed'||call.role!=='caller'||iceRestarting)return;
    if(iceRetry>=2){setStatus(hasTurn?'Call recovery failed. Please end and retry on a stable connection.':'Connection could not be restored. A TURN relay may be required for these networks.');return;}
    iceRestarting=true;iceRetry++;
    setStatus('Reconnecting call… attempt '+iceRetry+' of 2.');
    try{
      {const config=await getIceServers();if(call?.id!==id||peerConnection!==pc)return;
        if(config.relay){iceServers=config.servers;hasTurn=true;pc.setConfiguration({iceServers});}}
      if(pc.signalingState!=='stable')return;
      pendingIce=[];videoDescriptionQueued=false;
      const offer=await pc.createOffer({iceRestart:true});
      await pc.setLocalDescription(offer);
      if(call?.id===id&&peerConnection===pc)sendDescription('offer');
    }catch(_){if(call?.id===id)setStatus('Could not restart the connection. End the call and try again.');}
    finally{iceRestarting=false;}
  }
  function scheduleIceRecovery(state){
    if(iceRetryTimer)clearTimeout(iceRetryTimer);
    if(state==='connected'){iceRetry=0;iceRetryTimer=null;return;}
    if(!call||!peerConnection||call.role!=='caller')return;
    // 'disconnected' is transient; avoid falsely announcing TURN failure.
    iceRetryTimer=setTimeout(()=>{
      if(!call||!peerConnection)return;
      if(['disconnected','failed'].includes(peerConnection.connectionState))void tryIceRestart();
    },state==='failed'?1000:8000);
  }
  function stopScreenShare(){
    const old=shareTrack, oldAudio=shareAudioTrack;
    shareTrack=null;shareAudioTrack=null;sharing=false;sharingAudio=false;
    // Stop *only* screen media. Keep the microphone and its independent mute state.
    if(screenVideoSender&&peerConnection?.signalingState!=='closed')void screenVideoSender.replaceTrack(null).catch(()=>{});
    if(screenAudioSender&&peerConnection?.signalingState!=='closed')void screenAudioSender.replaceTrack(null).catch(()=>{});
    if(old&&call?.state==='accepted')queueSignal('ice',{vxskScreen:true,active:false,audio:false});
    if(old)old.onended=null;
    if(oldAudio)oldAudio.onended=null;
    shareStream?.getTracks()?.forEach(t=>t.stop());shareStream=null;
    if(old&&call?.state==='accepted')broadcastMediaState();
    removeShareTile('self');
    if(localVideo)localVideo.srcObject=localMedia?.getVideoTracks().length?new MediaStream(localMedia.getVideoTracks()):null;
    updateScreenUi();
  }
  function updateLocalMicStatus(){
    if(!localMicStatus)return;
    const tracks=localMedia?.getAudioTracks()||[];
    localMicStatus.hidden=!(call?.state==='accepted'&&tracks.length&&tracks.every(t=>!t.enabled||t.readyState!=='live'));
  }
  function updateSelfPreview(){
    const active=Boolean(call?.state==='accepted'&&localMedia?.getVideoTracks().some(t=>t.enabled&&t.readyState==='live'));
    if(selfPreview)selfPreview.hidden=!active;
    if(!localVideo)return;
    const track=localMedia?.getVideoTracks().find(t=>t.enabled&&t.readyState==='live')||null;
    const stream=localVideo.srcObject;
    if(track){
      if(!stream||stream.getVideoTracks()[0]!==track)localVideo.srcObject=new MediaStream([track]);
      void localVideo.play().catch(()=>{});
    }else if(stream){localVideo.srcObject=null;}
  }
  function updateScreenUi(){
    if(!call){if(selfPreview)selfPreview.hidden=true;if(localMicStatus)localMicStatus.hidden=true;return;}
    updateSelfPreview();
    updateLocalMicStatus();
    if(screenButton){screenButton.hidden=call.state!=='accepted'||!peerConnection;screenButton.textContent=sharing?'STOP SHARING':'SHARE SCREEN';}
    if(shareLabel){shareLabel.hidden=!sharing&&!friendScreen;shareLabel.textContent=sharing?(sharingAudio?'YOU ARE SHARING + SOUND':'YOU ARE SHARING SCREEN'):(friendSharingAudio?'FRIEND IS SHARING + SOUND':'FRIEND IS SHARING SCREEN');}
    mediaBox.hidden=call.medium!=='video'&&!(peerCameraTrack&&!peerCameraTrack.muted&&!peerCameraOff)&&!localMedia?.getVideoTracks().some(t=>t.readyState==='live'&&t.enabled);
    updateCameraPlaceholder();
    mediaBox.dataset.localShare=String(sharing);
    mediaBox.dataset.remoteShare=String(friendScreen);
    if(fullscreenButton)fullscreenButton.textContent=(document.fullscreenElement===mediaBox||theater)?'EXIT SHARE FULLSCREEN ↙':((sharing||friendScreen)?'FULLSCREEN SHARE ⛶':'FULLSCREEN VIDEO ⛶');
    if(shareExit)shareExit.hidden=!(document.fullscreenElement===mediaBox||theater);
  }
  async function startScreenShare(){
    if(!call||call.state!=='accepted'||!peerConnection||!screenVideoSender)return;
    if(sharing){stopScreenShare();return;}
    if(!navigator.mediaDevices?.getDisplayMedia){setStatus('Screen sharing is not supported by this browser.');return;}
    // This call must occur synchronously after the click; the picker requires a gesture.
    let captured=null, changedVideo=false;
    const startingCallId=call.id, startingPc=peerConnection;
    try{
      captured=await navigator.mediaDevices.getDisplayMedia({
        video:{frameRate:{ideal:15,max:30}},
        audio:true,
        systemAudio:'include',
        surfaceSwitching:'include'
      });
      const track=captured.getVideoTracks()[0];
      let audioTrack=captured.getAudioTracks()[0]||null;
      if(!track||!call||call.id!==startingCallId||peerConnection!==startingPc){captured.getTracks().forEach(t=>t.stop());return;}
      await screenVideoSender.replaceTrack(track);changedVideo=true;
      // An extra audio transceiver is negotiated during call setup. Audio sharing
      // is independent of the microphone: mute only controls the mic track.
      if(audioTrack){
        try{
          if(!screenAudioSender)throw Error('No negotiated screen audio sender.');
          await screenAudioSender.replaceTrack(audioTrack);
        }catch(_){
          // Keep screen video usable in browsers that cannot send tab audio.
          audioTrack.stop();audioTrack=null;
        }
      }
      shareStream=captured;shareTrack=track;shareAudioTrack=audioTrack;
      sharing=true;sharingAudio=!!audioTrack;
      queueSignal('ice',{vxskScreen:true,active:true,audio:sharingAudio});
      broadcastMediaState();requestMediaRefresh();
      track.onended=()=>{if(shareTrack===track)stopScreenShare();};
      if(audioTrack)audioTrack.onended=()=>{
        if(shareAudioTrack===audioTrack){
          shareAudioTrack=null;sharingAudio=false;
          if(screenAudioSender&&peerConnection?.signalingState!=='closed')void screenAudioSender.replaceTrack(null).catch(()=>{});
          updateScreenUi();setStatus('Screen share continues without sound.');
        }
      };
      showShareTile('self','YOU',track,null);
      updateScreenUi();
      setStatus(audioTrack?
        'Sharing your screen and its audio. Your microphone stays independent.':
        'Sharing screen WITHOUT audio: if your browser offers it, select a tab and check Share tab audio, then try again.');
    }catch(e){
      if(changedVideo&&screenVideoSender&&peerConnection===startingPc){
        void screenVideoSender.replaceTrack(null).catch(()=>{});
      }
      if(captured)captured.getTracks().forEach(t=>t.stop());
      if(e?.name!=='NotAllowedError')setStatus('Screen sharing could not start'+(e?.name?' ('+e.name+')':'')+'. Try sharing a browser tab.');
    }
  }
  function updateCameraPlaceholder(){
    if(!cameraPlaceholder||!call)return;
    const live=!!(peerCameraTrack&&peerCameraTrack.readyState==='live'&&!peerCameraTrack.muted&&!peerCameraOff);
    if(cameraPlaceholderTimer)clearTimeout(cameraPlaceholderTimer);
    cameraPlaceholderTimer=null;
    if(live){cameraPlaceholder.hidden=true;if(call.medium==='audio')mediaBox.hidden=false;return;}
    // WebRTC can briefly mute a live camera during ICE changes or renegotiation.
    // Keep the previous image for a moment rather than flashing the avatar.
    if(peerCameraTrack&&peerCameraTrack.readyState==='live'&&peerCameraTrack.muted&&!peerCameraOff&&cameraPlaceholder.hidden){
      cameraPlaceholderTimer=setTimeout(()=>{
        if(!call)return;
        const visible=peerCameraTrack&&peerCameraTrack.readyState==='live'&&!peerCameraTrack.muted&&!peerCameraOff;
        cameraPlaceholder.hidden=!!visible;
      },1100);
    }else cameraPlaceholder.hidden=false;
  }
  function removeShareTile(id){const ui=shareTiles[id];if(!ui)return;ui.video.srcObject=null;
    ui.card.remove();delete shareTiles[id];if(privateShares)privateShares.hidden=!privateShares.childElementCount;
  }
  function showShareTile(id,name,track){
    if(!privateShares||!track)return;
    let ui=shareTiles[id];
    if(!ui){const card=document.createElement('article');card.className='vxsk-share-card';
      card.dataset.user=id;const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;
      const label=document.createElement('span');label.className='vxsk-screen-label';label.textContent=(id==='self'?'YOU':name)+' · SCREEN';
      const tools=document.createElement('div');tools.className='vxsk-share-tools';
      const mute=document.createElement('button');mute.type='button';mute.className='vxsk-mini-control';mute.textContent='MUTE SHARE SOUND';
      const full=document.createElement('button');full.type='button';full.className='vxsk-mini-control';full.textContent='FULLSCREEN ⛶';
      if(id==='self')mute.hidden=true;
      else mute.addEventListener('click',()=>{shareMuted=!shareMuted;if(remoteShareAudio)remoteShareAudio.muted=shareMuted;
        mute.textContent=shareMuted?'UNMUTE SHARE SOUND':'MUTE SHARE SOUND';mute.setAttribute('aria-pressed',String(shareMuted));});
      full.addEventListener('click',async()=>{
        if(document.fullscreenElement===card||card.classList.contains('vxsk-share-theater')){
          card.classList.remove('vxsk-share-theater');if(document.fullscreenElement===card)await document.exitFullscreen().catch(()=>{});return;}
        try{await card.requestFullscreen();}catch(_){card.classList.add('vxsk-share-theater');}
      });
      tools.append(mute,full);card.append(video,label,tools);privateShares.append(card);
      ui={card,video};shareTiles[id]=ui;
    }
    // Repeated media-state updates must not recreate srcObject. Doing so can
    // interrupt an otherwise healthy screen track and cause a blank share.
    if(ui.track!==track){ui.track=track;ui.video.srcObject=new MediaStream([track]);void ui.video.play().catch(()=>{});}
    privateShares.hidden=false;
  }
  function avatarFallback(node,name){
    if(!node)return;
    node.replaceChildren();node.textContent=(name||'V').slice(0,1).toUpperCase();
    node.setAttribute('aria-label',name||'Player');
  }
  function updateAvatars(){
    if(!call)return;
    const n=$('nav-nickname')?.textContent||'YOU';
    if(myName)myName.textContent=n;
    if(peerName)peerName.textContent=call.name;
    avatarFallback(myAvatar,n);avatarFallback(peerAvatar,call.name);
    if(videoPeerName)videoPeerName.textContent=call.name;avatarFallback(videoPeerAvatar,call.name);
    const own=$('nav-avatar');
    if(own&&!own.hidden&&own.src){
      const img=document.createElement('img');img.src=own.src;img.alt='';img.decoding='async';
      img.onerror=()=>img.remove();myAvatar.append(img);
    }
    // The community module exposes only avatars a player opted to share.
    const community=window.VXSKCommunity;
    if(community?.refreshFriendAvatar){void community.refreshFriendAvatar(peerAvatar,call.peerId);void community.refreshFriendAvatar(videoPeerAvatar,call.peerId);}
    else if(community?.addFriendAvatar){void community.addFriendAvatar(peerAvatar,call.peerId);void community.addFriendAvatar(videoPeerAvatar,call.peerId);}
  }
  function clearMeters(){
    if(meterRaf)cancelAnimationFrame(meterRaf);meterRaf=0;
    localAnalyser=null;remoteAnalyser=null;voiceLast=0;
    const a=myAvatar?.closest('.vxsk-voice-user'),b=peerAvatar?.closest('.vxsk-voice-user');
    a?.classList.remove('is-speaking');b?.classList.remove('is-speaking');
    if(meterCtx){void meterCtx.close().catch(()=>{});meterCtx=null;}
  }
  function meter(stream){
    if(!stream?.getAudioTracks().length)return null;
    try{
      const AudioCtx=window.AudioContext||window.webkitAudioContext;
      if(!AudioCtx)return null;
      if(!meterCtx)meterCtx=new AudioCtx();
      if(meterCtx.state==='suspended')void meterCtx.resume().catch(()=>{});
      const source=meterCtx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      const analyser=meterCtx.createAnalyser();analyser.fftSize=256;
      source.connect(analyser); // No destination: analysis only; nothing recorded.
      return analyser;
    }catch(_){return null;}
  }
  function speaking(analyser,enabled=true){
    if(!analyser||!enabled||meterCtx?.state!=='running')return false;
    const samples=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(samples);
    let sum=0;for(const x of samples){const v=(x-128)/128;sum+=v*v;}
    return Math.sqrt(sum/samples.length)>.028;
  }
  function tickVoice(time){
    if(!call||call.medium!=='audio'||call.state!=='accepted'||!localMedia){clearMeters();return;}
    if(time-voiceLast>95){
      const enabled=localMedia.getAudioTracks().some(t=>t.enabled&&t.readyState==='live');
      myAvatar?.closest('.vxsk-voice-user')?.classList.toggle('is-speaking',speaking(localAnalyser,enabled));
      peerAvatar?.closest('.vxsk-voice-user')?.classList.toggle('is-speaking',speaking(remoteAnalyser));
      voiceLast=time;
    }
    meterRaf=requestAnimationFrame(tickVoice);
  }
  function initMeter(){
    if(!call||call.medium!=='audio'||!localMedia)return;
    if(!localAnalyser)localAnalyser=meter(localMedia);
    if(remoteMedia?.getAudioTracks().length&&!remoteAnalyser)remoteAnalyser=meter(remoteMedia);
    if(!meterRaf)meterRaf=requestAnimationFrame(tickVoice);
  }

  function present(){
    if(!call)return;
    display();
    title.textContent=(call.medium==='video'?'VIDEO':'AUDIO')+' CALL · '+call.name;
    const ringing=call.state==='ringing';
    acceptButton.hidden=!(ringing&&call.role==='callee');
    declineButton.hidden=!(ringing&&call.role==='callee');
    hangupButton.hidden=!(call.role==='caller'||call.state==='accepted');
    hangupButton.textContent=ringing?'CANCEL CALL':'END CALL';
    muteButton.hidden=call.state!=='accepted'||!localMedia;
    cameraButton.hidden=call.state!=='accepted'||!localMedia;
    muteFriendButton.hidden=call.state!=='accepted';
    updateScreenUi();
    if(voices)voices.hidden=call.medium!=='audio'||call.state!=='accepted';
    if(playMediaButton)playMediaButton.hidden=call.state!=='accepted'||!playNeedsGesture;
    if(fullscreenButton)fullscreenButton.hidden=call.state!=='accepted';
    if(networkButton)networkButton.hidden=call.state!=='accepted';
    updateRingtone();mini();
  }
  function stopMedia(){
    stopLatency();
    clearMeters();
    stopTones();
    if(cameraPlaceholderTimer)clearTimeout(cameraPlaceholderTimer);cameraPlaceholderTimer=null;
    if(iceRetryTimer)clearTimeout(iceRetryTimer);iceRetryTimer=null;iceRetry=0;iceRestarting=false;
    void exitLargeShare();
    if(mediaRefreshTimer)clearTimeout(mediaRefreshTimer);mediaRefreshTimer=null;mediaRefreshBusy=false;lastStateSync=0;autoCameraRequested=false;
    stopScreenShare();videoSender=null;screenVideoSender=null;screenAudioSender=null;friendScreen=false;friendSharingAudio=false;peerCameraTrack=null;peerScreenTrack=null;peerCameraOff=false;friendMuted=false;shareMuted=false;
    removeShareTile('friend');removeShareTile('self');
    try{peerConnection?.close();}catch(_){} peerConnection=null;
    localMedia?.getTracks().forEach(track=>track.stop());localMedia=null;
    remoteMedia?.getTracks().forEach(track=>track.stop());remoteMedia=null;
    localVideo.srcObject=null;if(selfPreview)selfPreview.hidden=true;if(localMicStatus)localMicStatus.hidden=true;remoteVideo.srcObject=null;remoteAudio.srcObject=null;remoteAudio.muted=false;muteFriendButton.textContent='MUTE FRIEND';
    if(cameraPlaceholder)cameraPlaceholder.hidden=true;
    if(remoteShareAudio)remoteShareAudio.srcObject=null;
    pendingIce=[];signaling=Promise.resolve();lastSignal=0;collectingMedia=false;
    videoDescriptionQueued=false;videoIceBuffer=[];playNeedsGesture=false;iceReady=false;hasTurn=false;iceServers=freeStunServers;
    if(playMediaButton)playMediaButton.hidden=true;
    if(networkButton)networkButton.hidden=true;
    if(fullscreenButton){fullscreenButton.hidden=true;fullscreenButton.textContent='FULLSCREEN SHARE ⛶';fullscreenButton.setAttribute('aria-pressed','false');}
    if(networkInfo){networkInfo.hidden=true;networkInfo.textContent='';}
  }
  function dismiss(message=''){
    stopMedia();call=null;minimized=false;
    if(panel.open)panel.close();panel.hidden=true;if(dock)dock.hidden=true;
    if(voices)voices.hidden=true;
    setStatus('');
    if(message){const feedback=$('community-feedback');if(feedback)feedback.textContent=message;}
  }
  async function request(name,args={}){
    const instance=api();
    if(!instance)throw Error('The account service is unavailable.');
    const {data,error}=await instance.rpc(name,args);
    if(error){
      if(/schema cache|could not find|function.*does not exist/i.test(error.message||''))
        throw Error('Friend calls are not installed in STAGING yet. Run the V12.8.11 friend-call SQL.');
      throw Error('Call service unavailable. Check your connection or permissions.');
    }
    return data;
  }
  async function currentUser(){
    const instance=api();if(!instance)return null;
    const {data,error}=await instance.auth.getSession();
    if(error||!data?.session?.user)return null;
    const {data:aal,error:aalError}=await instance.auth.mfa.getAuthenticatorAssuranceLevel();
    if(aalError||aal?.currentLevel==='aal1'&&aal?.nextLevel==='aal2')return null;
    return data.session.user;
  }
  function queueSignal(kind,body){
    const id=call?.id;
    if(!id)return;
    signaling=signaling.then(async()=>{
      if(call?.id!==id)return;
      const ok=await request('vxsk_friend_call_signal',{p_call_id:id,p_kind:kind,p_body:body});
      if(!ok)throw Error('Call signaling permission denied.');
    }).catch(e=>{ if(call?.id===id)setStatus(e.message||'Call connection failed.'); });
  }
  // Legacy bounded ICE gathering; initial SDP now sends promptly and candidates trickle.
  // Waiting 10s caused slow video pickup and enlarged SDP beyond the RPC cap.
  async function waitForVideoIce(pc){
    if(pc.iceGatheringState==='complete')return;
    await new Promise(resolve=>{
      let done=false;
      const finish=()=>{
        if(done)return;done=true;
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange',check);
        resolve();
      };
      const check=()=>{if(pc.iceGatheringState==='complete'||pc.signalingState==='closed')finish();};
      const timer=setTimeout(finish,10000);
      pc.addEventListener('icegatheringstatechange',check);
      check();
    });
  }
  function sendDescription(kind){
    const pc=peerConnection;
    if(!pc?.localDescription)return;
    // pc.localDescription may contain host/STUN candidates that weren't present
    // in the original offer/answer returned by createOffer/createAnswer.
    queueSignal(kind,{type:kind,sdp:pc.localDescription.sdp});
    if(call?.medium==='video'){
      videoDescriptionQueued=true;
      // Queue SDP first, then all ICE emitted before the offer/answer.
      for(const c of videoIceBuffer.splice(0))queueSignal('ice',c);
    }
  }
  function showMediaPlaybackNeeded(){
    if(!call)return;
    playNeedsGesture=true;
    if(playMediaButton)playMediaButton.hidden=false;
    setStatus('Connected, but your browser blocked friend audio. Click PLAY FRIEND SOUND.');
  }
  async function tryPlayMedia(element){
    if(!element?.srcObject)return;
    try{await element.play();if([remoteAudio,remoteShareAudio].filter(a=>a?.srcObject).every(a=>!a.paused)){playNeedsGesture=false;if(playMediaButton)playMediaButton.hidden=true;}}
    catch(e){if(e?.name==='NotAllowedError')showMediaPlaybackNeeded();else setStatus('Friend media received, but your browser could not play it.');}
  }
  async function startMedia(){
    if(!call||localMedia||collectingMedia)return;
    collectingMedia=true;
    try{
      if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==='undefined')
        throw Error('Your browser does not support secure audio/video calling.');
      setStatus('Asking for microphone permission… camera is optional.');
      const startedCallId=call.id;
      // Obtain microphone alone first. Denying/losing camera never affects it.
      const stream=await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true},video:false
      });
      if(!call||call.id!==startedCallId){stream.getTracks().forEach(t=>t.stop());return;}
      // Video calls connect by microphone first. Camera permission cannot hold
      // the Accept flow hostage; each participant enables it independently.
      if(!call||call.id!==startedCallId){stream.getTracks().forEach(t=>t.stop());return;}
      localMedia=stream;localVideo.srcObject=stream.getVideoTracks().length?new MediaStream(stream.getVideoTracks()):null;
      cameraButton.textContent=stream.getVideoTracks().some(t=>t.enabled)?'CAMERA OFF':'CAMERA ON';
      if(call.medium==='audio')initMeter();
      if(stream.getVideoTracks().length)void localVideo.play().catch(()=>{});
      present();
      if(call.role==='callee'&&call.state==='ringing'){
        const accepted=await request('vxsk_friend_call_answer',{p_call_id:call.id,p_accept:true});
        if(!accepted)throw Error('This invitation is no longer available.');
        call.state='accepted';
        updateAvatars();present();
      }
      const config=await getIceServers();
      if(call?.id!==startedCallId)return;
      iceServers=config.servers;hasTurn=config.relay;iceReady=true;
      makeConnection();
      setStatus(hasTurn?'Connecting securely through STUN/TURN…':'Connecting directly… relay not configured.');
      if(call.role==='caller'){
        const offer=await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        if(call?.id===startedCallId)sendDescription('offer');
      }
    }catch(err){
      const reason=err?.name==='NotAllowedError'?'Microphone/camera permission denied.':
        err?.name==='NotFoundError'?'A microphone or camera was not found.':
        err?.name==='NotReadableError'?'Camera/microphone is busy in another app.':
        err?.message||'Could not start the call.';
      await endCall();
      const feedback=$('community-feedback');
      if(feedback)feedback.textContent='Call cancelled: '+reason;
    }finally{collectingMedia=false;}
  }
  async function prepareCalleeChannels(){
    if(!peerConnection||!localMedia)return;
    const t=peerConnection.getTransceivers();
    if(t.length<4||t[0].receiver.track.kind!=='audio'||t[1].receiver.track.kind!=='video'||
       t[2].receiver.track.kind!=='video'||t[3].receiver.track.kind!=='audio')
      throw Error('Unexpected call media channel order');
    for(const item of t.slice(0,4))item.direction='sendrecv';
    videoSender=t[1].sender;screenVideoSender=t[2].sender;screenAudioSender=t[3].sender;
    await Promise.all([
      t[0].sender.replaceTrack(localMedia.getAudioTracks()[0]||null),
      videoSender.replaceTrack(localMedia.getVideoTracks().find(x=>x.readyState==='live'&&x.enabled)||null),
      screenVideoSender.replaceTrack(shareTrack||null),
      screenAudioSender.replaceTrack(shareAudioTrack||null)
    ]);
    updateScreenUi();
  }
  function makeConnection(){
    if(peerConnection||!localMedia)return;
    // STUN helps peers connect on different networks. Strict NATs may require a TURN server.
    const pc=new RTCPeerConnection({iceServers,bundlePolicy:'max-bundle'});
    peerConnection=pc;
    // A fixed transceiver order on BOTH peers: microphone, camera, screen, tab audio.
    // This prevents switching cameras off when screens start and fixes one-way shares.
    // Only the caller constructs four offer channels. Chromium may fail to
    // re-use locally-created answerer transceivers, leading to duplicate
    // m-lines and a one-way screen share. The callee binds to offer m-lines.
    if(call.role==='caller'){
      const mic=localMedia.getAudioTracks()[0],cam=localMedia.getVideoTracks()[0];
      if(mic)pc.addTrack(mic,localMedia);else pc.addTransceiver('audio',{direction:'sendrecv'});
      videoSender=cam?pc.addTrack(cam,localMedia):pc.addTransceiver('video',{direction:'sendrecv'}).sender;
      screenVideoSender=pc.addTransceiver('video',{direction:'sendrecv'}).sender;
      screenAudioSender=pc.addTransceiver('audio',{direction:'sendrecv'}).sender;
    }
    updateScreenUi();
    pc.ontrack=event=>{
      if(!call||peerConnection!==pc)return;
      const idx=pc.getTransceivers().indexOf(event.transceiver);
      const track=event.track;
      if(idx===0){ // Friend microphone, never mixed with their screen sound.
        if(!remoteMedia)remoteMedia=new MediaStream();
        if(!remoteMedia.getAudioTracks().some(t=>t.id===track.id))remoteMedia.addTrack(track);
        remoteAudio.srcObject=new MediaStream([track]);remoteAudio.muted=friendMuted;
        void tryPlayMedia(remoteAudio);
        if(call.medium==='audio'){remoteAnalyser=meter(remoteMedia);initMeter();}
      }else if(idx===1){ // Friend camera (independent of any screen share).
        peerCameraTrack=track;remoteVideo.srcObject=new MediaStream([track]);remoteVideo.muted=true;
        const toggle=()=>{if(!call||peerConnection!==pc)return;updateCameraPlaceholder();updateScreenUi();};
        track.addEventListener('unmute',toggle);track.addEventListener('mute',toggle);track.addEventListener('ended',toggle);
        toggle();void tryPlayMedia(remoteVideo);
      }else if(idx===2){ // Incoming share is independent of sender's camera.
        peerScreenTrack=track;
        const toggle=()=>{
          if(!call||peerConnection!==pc)return;
          // An unmuted screen RTP track is authoritative even if the metadata
          // message arrived late. Transient RTP mute must not delete the tile.
          if(!track.muted&&track.readyState==='live')friendScreen=true;
          if(friendScreen)showShareTile('friend',call.name,track,remoteShareAudio);
          else removeShareTile('friend');
          updateScreenUi();
        };
        track.addEventListener('unmute',toggle);track.addEventListener('mute',toggle);
        track.addEventListener('ended',()=>{peerScreenTrack=null;friendScreen=false;removeShareTile('friend');updateScreenUi();});toggle();
      }else if(idx===3){ // Share sound is a separate incoming audio track.
        const show=()=>{
          if(!call||peerConnection!==pc)return;
          remoteShareAudio.srcObject=new MediaStream([track]);remoteShareAudio.muted=shareMuted;
          void tryPlayMedia(remoteShareAudio);updateScreenUi();
        };
        const hide=()=>{remoteShareAudio.srcObject=null;updateScreenUi();};
        track.addEventListener('unmute',show);track.addEventListener('mute',hide);track.addEventListener('ended',hide);
        if(!track.muted)show();
      }
    };
    pc.onicecandidate=event=>{
      if(!event.candidate||call?.state!=='accepted')return;
      const candidate=event.candidate.toJSON();
      if(call.medium==='video'&&!videoDescriptionQueued){videoIceBuffer.push(candidate);return;}
      queueSignal('ice',candidate);
    };
    pc.onconnectionstatechange=()=>{
      if(pc.connectionState==='connected')startLatency();else void updateLatency();
      if(!call||peerConnection!==pc)return;
      if(pc.connectionState==='connected'){
        scheduleIceRecovery('connected');broadcastMediaState();
        // This optional prompt begins AFTER audio is connected. Camera refused,
        // missing or in use never terminates the video call.
        if(call.medium==='video'&&!autoCameraRequested){
          autoCameraRequested=true;
          if(!localMedia?.getVideoTracks().some(t=>t.readyState==='live'&&t.enabled))
            void cameraButton.click();
        }
        setStatus(playNeedsGesture?'Connected. Click PLAY FRIEND SOUND to enable audio.':'Connected · live '+call.medium+' call');
      }else if(pc.connectionState==='disconnected'){
        setStatus('Network briefly interrupted. Trying to reconnect…');
        scheduleIceRecovery('disconnected');
      }else if(pc.connectionState==='failed'){
        setStatus('Call disconnected. Attempting connection recovery…');
        scheduleIceRecovery('failed');
      }
    };
  }
  async function iceCandidate(body){
    if(!peerConnection?.remoteDescription){pendingIce.push(body);return;}
    try{await peerConnection.addIceCandidate(new RTCIceCandidate(body));}catch(_){}
  }
  async function flushIce(){
    while(pendingIce.length&&peerConnection?.remoteDescription)await iceCandidate(pendingIce.shift());
  }
  async function consumeSignals(events){
    for(const item of events){
      const id=Number(item.id);
      if(!Number.isSafeInteger(id)||id<=lastSignal)continue;
      try{
        if(item.kind==='ice'){
          if(item.body?.vxskRefresh===true){if(call?.role==='caller')requestMediaRefresh();}
          else if(item.body?.vxskMediaState===true){
            peerCameraOff=item.body.camera!==true;
            friendScreen=item.body.screen===true;friendSharingAudio=friendScreen&&item.body.audio===true;
            if(friendScreen&&peerScreenTrack)showShareTile('friend',call.name,peerScreenTrack);
            else if(!friendScreen)removeShareTile('friend');
            updateScreenUi();
          }
          else if(item.body?.vxskCamera===true){peerCameraOff=item.body.enabled!==true;updateScreenUi();}
          else if(item.body?.vxskScreen===true){friendScreen=item.body.active===true;friendSharingAudio=friendScreen&&item.body.audio===true;
            if(friendScreen&&peerScreenTrack)showShareTile('friend',call.name,peerScreenTrack);else if(!friendScreen)removeShareTile('friend');
            updateScreenUi();}
          else if(item.body&&typeof item.body.candidate==='string')await iceCandidate(item.body);
        }else if(item.kind==='offer'&&call?.role==='callee'&&item.body?.type==='offer'){
          if(!localMedia||!iceReady)break; // Await media + TURN config; do not create a STUN-only peer by race.
          if(!peerConnection)makeConnection();
          if(!peerConnection||peerConnection.signalingState!=='stable')break;
          await peerConnection.setRemoteDescription(item.body);
          await flushIce();
          await prepareCalleeChannels();
          await peerConnection.setLocalDescription(await peerConnection.createAnswer());
          if(call)sendDescription('answer');
        }else if(item.kind==='answer'&&call?.role==='caller'&&item.body?.type==='answer'){
          if(!peerConnection||!peerConnection.localDescription)break;
          // CRITICAL: an ICE restart creates a NEW offer while a previous remote
          // answer already exists. Accept the new answer whenever we're waiting
          // on a local offer, not only when remoteDescription is absent.
          if(peerConnection.signalingState==='have-local-offer'){
            await peerConnection.setRemoteDescription(item.body);
            await flushIce();
          }
        }
        lastSignal=id; // Advance only after successful processing (not before).
      }catch(error){
        setStatus('Video signaling error ('+(error?.name||'unknown')+'). End the call and retry.');
        break; // Do not silently swallow or permanently skip a failed SDP.
      }
    }
  }
  async function inspectConnection(){
    if(!networkInfo)return;
    if(!call||!peerConnection){networkInfo.textContent='No active peer connection yet.';networkInfo.hidden=false;return;}
    const pc=peerConnection;
    const summary={
      peer:pc.connectionState||'unknown',
      ice:pc.iceConnectionState||'unknown',
      signaling:pc.signalingState||'unknown',
      relayConfigured:hasTurn,
      retries:iceRetry,
      localAudio:localMedia?.getAudioTracks().filter(t=>t.readyState==='live').length||0,
      localVideo:localMedia?.getVideoTracks().filter(t=>t.readyState==='live').length||0,
      remoteAudio:remoteMedia?.getAudioTracks().filter(t=>t.readyState==='live').length||0,
      remoteVideo:Number(peerCameraTrack?.readyState==='live'),
      audioPlaying:!!remoteAudio?.srcObject&&!remoteAudio.paused,
      sharedAudioPlaying:!!remoteShareAudio?.srcObject&&!remoteShareAudio.paused
    };
    // Report only candidate TYPES, never IP addresses, port numbers, or raw SDP.
    let path='unknown';
    try{
      const stats=await pc.getStats();
      let selected=null;
      stats.forEach(report=>{if(report.type==='transport'&&report.selectedCandidatePairId)selected=stats.get(report.selectedCandidatePairId);});
      if(!selected)stats.forEach(report=>{if(report.type==='candidate-pair'&&report.nominated&&report.state==='succeeded')selected=report;});
      if(selected){
        const local=stats.get(selected.localCandidateId),remote=stats.get(selected.remoteCandidateId);
        const types=[local?.candidateType,remote?.candidateType].filter(Boolean);
        if(types.includes('relay'))path='relay';
        else if(types.length)path='direct';
      }
    }catch(_){/* Some browsers don't expose selected candidate statistics. */}
    const lines=[
      'Connection: '+summary.peer+' | ICE: '+summary.ice+' | Signaling: '+summary.signaling,
      'Path: '+path+' | TURN configured: '+(summary.relayConfigured?'yes':'no')+' | Retries: '+summary.retries,
      'Your tracks: audio '+summary.localAudio+', video '+summary.localVideo,
      'Friend tracks: audio '+summary.remoteAudio+', video '+summary.remoteVideo,
      'Friend microphone playback: '+(summary.audioPlaying?'playing':'not playing yet'),
      'Friend shared sound: '+(summary.sharedAudioPlaying?'playing':'not sharing or blocked'),
      'Your camera send: '+(videoSender?.track?.readyState||'OFF')+', enabled: '+(videoSender?.track?.enabled===true),
      'Your screen send: '+(screenVideoSender?.track?.readyState||'OFF'),
      'Friend camera receive: '+(peerCameraTrack?.readyState||'NOT READY')+', muted: '+(peerCameraTrack?.muted!==false),
      'Friend screen receive: '+(peerScreenTrack?.readyState||'NOT READY')+', muted: '+(peerScreenTrack?.muted!==false)
    ];
    if(!hasTurn)lines.push('TURN relay unavailable. Enable secure TURN in Supabase for worldwide connectivity.');
    networkInfo.textContent=lines.join('\n');networkInfo.hidden=false;
  }
  async function pollCall(){
    if(!call||updating)return;
    updating=true;
    const id=call.id;
    try{
      const u=await currentUser();
      if(!u||u.id!==myId){dismiss('Call ended because the account changed.');return;}
      const data=await request('vxsk_friend_call_events',{p_call_id:id,p_after:lastSignal});
      if(!call||call.id!==id)return;
      if(!data||['declined','missed','ended'].includes(data.state)){
        dismiss(data?.state==='declined'?'Your friend declined the call.':data?.state==='missed'?'Call invitation expired.':'Call ended.');return;
      }
      if(data.state==='accepted'&&call.state==='ringing'){
        call.state='accepted';updateAvatars();present();
        if(call.role==='caller')await startMedia();
      }
      if(call.state==='accepted'&&Array.isArray(data.events))await consumeSignals(data.events);
      // Periodic state snapshot repairs one-way UI when a share-start message
      // is delayed or missed. No camera/mic permission request is performed.
      if(peerConnection?.connectionState==='connected'&&Date.now()-lastStateSync>12000)broadcastMediaState();
    }catch(e){if(call?.id===id)setStatus(e.message||'Waiting for connection…');}
    finally{updating=false;}
  }
  async function pollInbox(){
    if(call||checkingInbox)return; // Tab must stay open; background polling may be throttled.
    checkingInbox=true;
    try{
      const u=await currentUser();if(!u){myId=null;return;}myId=u.id;
      const list=await request('vxsk_friend_call_inbox');
      if(call||!Array.isArray(list))return;
      const incoming=list.find(x=>x.callee===myId&&x.state==='ringing');
      if(incoming){
        call={id:incoming.id,role:'callee',peerId:incoming.peer_id,medium:incoming.medium,name:incoming.peer_name||'VXSK FRIEND',state:'ringing'};
        minimized=false;updateAvatars();setStatus('Incoming call. Camera and microphone stay OFF until you accept.');present();
      }
      // Do not auto-join a second tab after an invitation has been accepted.
    }catch(_){/* Missing staging migration is surfaced when a player clicks Call. */}
    finally{checkingInbox=false;}
  }
  async function endCall(){
    const id=call?.id;
    dismiss();
    if(id)try{await request('vxsk_friend_call_end',{p_call_id:id});}catch(_){}
  }
  async function declineCall(){
    const id=call?.id;
    if(!id||call?.role!=='callee')return;
    dismiss();
    try{await request('vxsk_friend_call_answer',{p_call_id:id,p_accept:false});}catch(_){}
  }
  async function start(peerId,medium,name){
    if(window.VXSKGroupCalls?.isActive?.()){const notice=$('community-feedback');if(notice)notice.textContent='Leave your group call before starting a private call.';return;}
    if(call){setStatus('End your current call before starting another.');present();return;}
    if(!['audio','video'].includes(medium)||!/^[a-f0-9-]{36}$/i.test(String(peerId)))return;
    const user=await currentUser();
    if(!user){
      const feedback=$('community-feedback');if(feedback)feedback.textContent='Complete your account sign-in and 2FA before calling.';
      document.querySelector('.open-account')?.click();return;
    }
    myId=user.id;
    setStatus('Checking friend availability…');
    try{
      const id=await request('vxsk_friend_call_start',{p_peer:peerId,p_medium:medium});
      if(!id){const feedback=$('community-feedback');if(feedback)feedback.textContent='Call unavailable. Both accounts must be accepted friends and unblocked, with no other active calls.';return;}
      call={id,role:'caller',peerId,medium,name:String(name||'VXSK FRIEND').slice(0,40),state:'ringing'};
      minimized=false;updateAvatars();setStatus('Calling… Your microphone/camera will only start if your friend accepts.');present();
    }catch(e){const feedback=$('community-feedback');if(feedback)feedback.textContent=e.message;}
  }
  acceptButton.addEventListener('click',async()=>{
    if(call?.role!=='callee'||call.state!=='ringing')return;
    acceptButton.disabled=true;
    try{await startMedia();}finally{acceptButton.disabled=false;}
  });
  declineButton.addEventListener('click',declineCall);
  hangupButton.addEventListener('click',endCall);
  // X/Escape no longer decline or end a call. Calls end only via explicit END/DECLINE.
  closeButton.addEventListener('click',minimize);
  panel.addEventListener('cancel',event=>{event.preventDefault();minimize();});
  $('vxsk-call-restore')?.addEventListener('click',restore);
  $('vxsk-call-dock-end')?.addEventListener('click',endCall);
  ringToggle?.addEventListener('click',async()=>{
    ringEnabled=!ringEnabled;
    try{localStorage.setItem('vxsk-call-ringtone',''+ringEnabled);}catch(_){}
    ringtoneUi();
    if(ringEnabled){
      const ok=await unlockRingtone();
      if(!ok)setStatus('Enable sound for this site in your browser to hear call alerts.');
    }
    updateRingtone();
  });
  // Only explicit user interactions unlock audio. The browser/OS may still
  // suspend background tabs or enforce the user's system volume.
  document.addEventListener('pointerdown',()=>{if(ringEnabled&&!playingTone)void unlockRingtone();},{passive:true,once:true});
  try{ringEnabled=localStorage.getItem('vxsk-call-ringtone')!=='false';}catch(_){ringEnabled=true;}
  ringtoneUi();
  networkButton?.addEventListener('click',()=>{void inspectConnection();});
  playMediaButton?.addEventListener('click',async()=>{
    if(!call)return;
    // An explicit click allows unmuted audio on browsers with autoplay protection.
    if(remoteAudio.srcObject)await tryPlayMedia(remoteAudio);
    if(remoteShareAudio?.srcObject)await tryPlayMedia(remoteShareAudio);
    if(call.medium==='video'&&remoteVideo.srcObject)await tryPlayMedia(remoteVideo);
    const audioElements=[remoteAudio,remoteShareAudio].filter(el=>el?.srcObject);
    if(audioElements.length&&audioElements.every(el=>!el.paused)){
      playNeedsGesture=false;playMediaButton.hidden=true;setStatus('Friend sound playback enabled.');
    }
  });
  muteButton.addEventListener('click',()=>{
    const tracks=localMedia?.getAudioTracks()||[];
    if(!tracks.length)return;
    const muted=tracks.some(track=>track.enabled);
    tracks.forEach(track=>{track.enabled=!muted;});
    muteButton.textContent=muted?'UNMUTE MICROPHONE':'MUTE MICROPHONE';
    if(muted)myAvatar?.closest('.vxsk-voice-user')?.classList.remove('is-speaking');
    updateLocalMicStatus();
  });
  function syncFullscreenButton(){
    if(!fullscreenButton)return;
    const active=document.fullscreenElement===mediaBox||document.fullscreenElement===fullStage||document.fullscreenElement===privateShares||theater;
    const share=sharing||friendScreen;
    fullscreenButton.textContent=active?'EXIT FULLSCREEN ↙':share?'FULLSCREEN SHARE ⛶':'FULLSCREEN VIDEO ⛶';
    fullscreenButton.setAttribute('aria-pressed',String(active));
    if(shareExit)shareExit.hidden=!active;
  }
  async function exitLargeShare(){
    if(theater){theater=false;mediaBox.classList.remove('vxsk-share-theater');privateShares?.classList.remove('vxsk-share-theater');}privateShares?.querySelectorAll('.vxsk-share-theater').forEach(x=>x.classList.remove('vxsk-share-theater'));
    if(document.fullscreenElement===mediaBox||document.fullscreenElement===fullStage||document.fullscreenElement===privateShares){
      try{await document.exitFullscreen();}catch(_){/* browser may already have exited */}
    }
    syncFullscreenButton();
  }
  fullscreenButton?.addEventListener('click',async()=>{
    if(!call||call.state!=='accepted')return;
    if(document.fullscreenElement===mediaBox||document.fullscreenElement===fullStage||document.fullscreenElement===privateShares||theater){await exitLargeShare();return;}
    const focusTarget=(sharing||friendScreen)&&privateShares&&!privateShares.hidden?privateShares:mediaBox;
    if(focusTarget.hidden){setStatus('Wait for video or a screen share to start before enlarging it.');return;}
    try{
      // Fullscreen THE IMAGE/SOUND-SHARE SURFACE — not the surrounding call window.
      if(!document.fullscreenElement&&focusTarget.requestFullscreen){await focusTarget.requestFullscreen();}
      else if(!document.fullscreenElement){theater=true;focusTarget.classList.add('vxsk-share-theater');}
      else setStatus('Exit the other fullscreen view first.');
    }catch(_){
      // On mobile Safari generic div.requestFullscreen is unavailable: use
      // a fixed, viewport-sized theater overlay, while keeping call active.
      theater=true;focusTarget.classList.add('vxsk-share-theater');
    }
    syncFullscreenButton();
  });
  shareExit?.addEventListener('click',()=>void exitLargeShare());
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&theater){e.preventDefault();void exitLargeShare();}});
  document.addEventListener('fullscreenchange',syncFullscreenButton);
  screenButton?.addEventListener('click',()=>{if(sharing)stopScreenShare();else void startScreenShare();});
  cameraButton.addEventListener('click',async()=>{
    if(!call||call.state!=='accepted'||!localMedia||!videoSender)return;
    const track=localMedia.getVideoTracks().find(t=>t.readyState==='live');
    if(track){
      track.enabled=!track.enabled;
      cameraButton.textContent=track.enabled?'CAMERA OFF':'CAMERA ON';
      queueSignal('ice',{vxskCamera:true,enabled:track.enabled});broadcastMediaState();updateScreenUi();
      if(track.enabled)requestMediaRefresh();
      return;
    }
    const id=call.id,pc=peerConnection;
    let stream;
    try{stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:360}},audio:false});}
    catch(e){setStatus('Camera unavailable ('+(e?.name||'permission/device')+'). Audio continues.');return;}
    const added=stream.getVideoTracks()[0];
    if(!call||call.id!==id||peerConnection!==pc||!added){stream.getTracks().forEach(t=>t.stop());return;}
    // Do NOT replace/recreate peer connections or microphone tracks.
    try{await videoSender.replaceTrack(added);}
    catch(e){stream.getTracks().forEach(t=>t.stop());setStatus('Camera send could not start ('+(e?.name||'media')+'). Audio continues.');return;}
    localMedia.getVideoTracks().filter(t=>t.readyState!=='live').forEach(t=>localMedia.removeTrack(t));
    localMedia.addTrack(added);localVideo.srcObject=new MediaStream([added]);void localVideo.play().catch(()=>{});
    added.onended=()=>{
      if(!localMedia?.getVideoTracks().includes(added))return;
      localMedia.removeTrack(added);void videoSender?.replaceTrack(null).catch(()=>{});
      localVideo.srcObject=null;cameraButton.textContent='CAMERA ON';
      queueSignal('ice',{vxskCamera:true,enabled:false});broadcastMediaState();updateScreenUi();
    };
    cameraButton.textContent='CAMERA OFF';queueSignal('ice',{vxskCamera:true,enabled:true});
    broadcastMediaState();requestMediaRefresh();updateScreenUi();
  });
  muteFriendButton?.addEventListener('click',()=>{
    friendMuted=!friendMuted;remoteAudio.muted=friendMuted;
    muteFriendButton.textContent=friendMuted?'UNMUTE FRIEND':'MUTE FRIEND';
    muteFriendButton.setAttribute('aria-pressed',String(friendMuted));
  });
  window.addEventListener('pagehide',()=>{if(call){const id=call.id;stopMedia();api()?.rpc('vxsk_friend_call_end',{p_call_id:id}).catch(()=>{});}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(call)void pollCall();else void pollInbox();}});
  // Incoming invitations (4s) and connection/signaling updates (1.25s).
  setInterval(()=>{if(!call)void pollInbox();},4000);
  setInterval(()=>{if(call)void pollCall();},1250);
  setTimeout(()=>void pollInbox(),900);
  window.VXSKCalls=Object.freeze({start,isActive:()=>Boolean(call)});
})();
