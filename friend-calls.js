'use strict';
// VXSK STAGING V12.8.14: ringtone, minimize-to-dock, voice-active avatars; WebRTC maintained.
// Signaling is via authenticated, participant-restricted Supabase RPCs.
// No automatic camera/microphone activation; calls are never recorded here.
(() => {
  const $ = id => document.getElementById(id);
  const panel = $('vxsk-call-panel');
  if (!panel) return;
  const title = $('vxsk-call-title'), status = $('vxsk-call-status');
  const acceptButton = $('vxsk-call-accept'), declineButton = $('vxsk-call-decline');
  const muteButton = $('vxsk-call-mute'), cameraButton = $('vxsk-call-camera');
  const hangupButton = $('vxsk-call-hangup'), closeButton = $('vxsk-call-close');
  const mediaBox = $('vxsk-call-video'), remoteVideo = $('vxsk-remote-video');
  const localVideo = $('vxsk-local-video'), remoteAudio = $('vxsk-remote-audio');
  const playMediaButton=$('vxsk-call-play-media');
  let call=null, peerConnection=null, localMedia=null, remoteMedia=null, lastSignal=0;
  let collectingMedia=false, updating=false, checkingInbox=false;
  let signaling=Promise.resolve(), pendingIce=[], myId=null;
  let videoDescriptionQueued=false, videoIceBuffer=[], playNeedsGesture=false;
  const dock=$('vxsk-call-dock'), dockTitle=$('vxsk-call-dock-title'), dockStatus=$('vxsk-call-dock-status');
  const ringToggle=$('vxsk-call-ringtone-toggle');
  const myAvatar=$('vxsk-call-my-avatar'),peerAvatar=$('vxsk-call-peer-avatar');
  const myName=$('vxsk-call-my-name'),peerName=$('vxsk-call-peer-name'),voices=$('vxsk-call-voices');
  let minimized=false,ringCtx=null,ringTimer=null,ringEnabled=false,ringLastSound=0;
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
    ringToggle.title=ringEnabled?'Mute incoming ringtone':'Enable incoming ringtone';
    const label=ringToggle.querySelector('span');if(label)label.textContent=ringEnabled?'RING ON':'RING OFF';
  }
  // Browsers may block sound until the player interacts with the page. Enable
  // ringtone by explicit click in the header; never ask for microphone access.
  async function unlockRingtone(){
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return false;
    try{
      if(!ringCtx)ringCtx=new AudioCtx();
      if(ringCtx.state==='suspended')await ringCtx.resume();
      return ringCtx.state==='running';
    }catch(_){return false;}
  }
  function ringBeep(){
    if(!ringEnabled||!call||call.role!=='callee'||call.state!=='ringing'||!ringCtx||ringCtx.state!=='running')return;
    const now=ringCtx.currentTime;
    for(let i=0;i<2;i++){
      const osc=ringCtx.createOscillator();const gain=ringCtx.createGain();
      osc.type='sine';osc.frequency.value=i?785:630;
      gain.gain.setValueAtTime(0.0001,now+i*.25);
      gain.gain.exponentialRampToValueAtTime(.055,now+i*.25+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,now+i*.25+.20);
      osc.connect(gain).connect(ringCtx.destination);
      osc.start(now+i*.25);osc.stop(now+i*.25+.22);
    }
    ringLastSound=Date.now();
  }
  function updateRingtone(){
    const should=Boolean(ringEnabled&&call?.role==='callee'&&call.state==='ringing');
    if(should){
      if(!ringTimer){void unlockRingtone().then(ok=>{if(ok)ringBeep();});ringTimer=setInterval(ringBeep,1950);}
    }else if(ringTimer){clearInterval(ringTimer);ringTimer=null;}
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
    const own=$('nav-avatar');
    if(own&&!own.hidden&&own.src){
      const img=document.createElement('img');img.src=own.src;img.alt='';img.decoding='async';
      img.onerror=()=>img.remove();myAvatar.append(img);
    }
    // The community module exposes only avatars a player opted to share.
    if(window.VXSKCommunity?.addFriendAvatar)void window.VXSKCommunity.addFriendAvatar(peerAvatar,call.peerId);
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
    cameraButton.hidden=call.medium!=='video'||call.state!=='accepted'||!localMedia;
    mediaBox.hidden=call.medium!=='video'||!localMedia;
    if(voices)voices.hidden=call.medium!=='audio'||call.state!=='accepted';
    if(playMediaButton)playMediaButton.hidden=call.state!=='accepted'||!playNeedsGesture;
    updateRingtone();mini();
  }
  function stopMedia(){
    clearMeters();
    if(ringTimer){clearInterval(ringTimer);ringTimer=null;}
    try{peerConnection?.close();}catch(_){} peerConnection=null;
    localMedia?.getTracks().forEach(track=>track.stop());localMedia=null;
    remoteMedia?.getTracks().forEach(track=>track.stop());remoteMedia=null;
    localVideo.srcObject=null;remoteVideo.srcObject=null;remoteAudio.srcObject=null;
    pendingIce=[];signaling=Promise.resolve();lastSignal=0;collectingMedia=false;
    videoDescriptionQueued=false;videoIceBuffer=[];playNeedsGesture=false;
    if(playMediaButton)playMediaButton.hidden=true;
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
  // Video uses complete (or time-bounded) ICE gathering for the initial SDP.
  // This reduces candidate/SDP ordering races when signaling is polled through RPC.
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
      // Candidates gathered while waiting are already embedded in localDescription.
      // Only send subsequent trickle candidates if gathering had to time out.
      videoIceBuffer=[];
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
    try{await element.play();if(element===remoteAudio){playNeedsGesture=false;if(playMediaButton)playMediaButton.hidden=true;}}
    catch(e){if(e?.name==='NotAllowedError')showMediaPlaybackNeeded();else setStatus('Friend media received, but your browser could not play it.');}
  }
  async function startMedia(){
    if(!call||localMedia||collectingMedia)return;
    collectingMedia=true;
    try{
      if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==='undefined')
        throw Error('Your browser does not support secure audio/video calling.');
      setStatus('Asking your browser for '+(call.medium==='video'?'camera and microphone':'microphone')+' permission…');
      const startedCallId=call.id;
      const stream=await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true},
        video:call.medium==='video'?{width:{ideal:640},height:{ideal:360},facingMode:'user'}:false
      });
      if(!call||call.id!==startedCallId){stream.getTracks().forEach(t=>t.stop());return;}
      localMedia=stream;localVideo.srcObject=stream;
      if(call.medium==='audio')initMeter();
      if(call.medium==='video')localVideo.play().catch(()=>{});
      present();
      if(call.role==='callee'&&call.state==='ringing'){
        const accepted=await request('vxsk_friend_call_answer',{p_call_id:call.id,p_accept:true});
        if(!accepted)throw Error('This invitation is no longer available.');
        call.state='accepted';
        updateAvatars();present();
      }
      makeConnection();
      setStatus('Connecting to your friend…');
      if(call.role==='caller'){
        const offer=await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        if(call.medium==='video')await waitForVideoIce(peerConnection);
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
  function makeConnection(){
    if(peerConnection||!localMedia)return;
    // STUN helps peers connect on different networks. Strict NATs may require a TURN server.
    const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}],bundlePolicy:'max-bundle'});
    peerConnection=pc;
    localMedia.getTracks().forEach(track=>pc.addTrack(track,localMedia));
    pc.ontrack=event=>{
      if(!call||peerConnection!==pc)return;
      if(!remoteMedia)remoteMedia=new MediaStream();
      if(!remoteMedia.getTracks().some(t=>t.id===event.track.id))remoteMedia.addTrack(event.track);
      if(call.medium==='audio'&&event.track.kind==='audio'){remoteAnalyser=meter(remoteMedia);initMeter();}
      // Separate remote sound from picture. This allows silent video autoplay while
      // a dedicated audio element can be enabled by a user gesture if necessary.
      if(call.medium==='video'){
        remoteVideo.muted=true;
        if(event.track.kind==='video'){
          remoteVideo.srcObject=new MediaStream(remoteMedia.getVideoTracks());
          void tryPlayMedia(remoteVideo);
        }else if(event.track.kind==='audio'){
          remoteAudio.srcObject=new MediaStream(remoteMedia.getAudioTracks());
          void tryPlayMedia(remoteAudio);
        }
      }else{
        // Preserve the already-working audio-only path from V12.8.12.
        remoteAudio.srcObject=remoteMedia;
        remoteAudio.play().catch(()=>{setStatus('Tap your browser audio control to hear your friend.');});
      }
    };
    pc.onicecandidate=event=>{
      if(!event.candidate||call?.state!=='accepted')return;
      const candidate=event.candidate.toJSON();
      if(call.medium==='video'&&!videoDescriptionQueued){videoIceBuffer.push(candidate);return;}
      queueSignal('ice',candidate);
    };
    pc.onconnectionstatechange=()=>{
      if(!call||peerConnection!==pc)return;
      if(pc.connectionState==='connected'){
        setStatus(playNeedsGesture?'Connected. Click PLAY FRIEND SOUND to enable audio.':'Connected · live '+call.medium+' call');
      }else if(pc.connectionState==='disconnected')setStatus('Connection interrupted. Reconnecting…');
      else if(pc.connectionState==='failed'){
        const noSdp=!pc.remoteDescription||!pc.localDescription;
        setStatus(noSdp?'Connection setup failed: incomplete video signaling.':
          'Network connection failed (ICE '+pc.iceConnectionState+'). A TURN relay may be required on these networks.');
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
          if(item.body&&typeof item.body.candidate==='string')await iceCandidate(item.body);
        }else if(item.kind==='offer'&&call?.role==='callee'&&item.body?.type==='offer'){
          if(!localMedia)break; // Re-read instead of discarding the offer during camera permission.
          if(!peerConnection)makeConnection();
          if(!peerConnection||peerConnection.signalingState!=='stable')break;
          await peerConnection.setRemoteDescription(item.body);
          await flushIce();
          await peerConnection.setLocalDescription(await peerConnection.createAnswer());
          if(call.medium==='video')await waitForVideoIce(peerConnection);
          if(call)sendDescription('answer');
        }else if(item.kind==='answer'&&call?.role==='caller'&&item.body?.type==='answer'){
          if(!peerConnection||!peerConnection.localDescription)break;
          if(!peerConnection.remoteDescription){
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
    if(ringEnabled){const ok=await unlockRingtone();if(!ok)setStatus('Ringtone blocked by browser. Tap the ringtone button again.');}
    updateRingtone();
  });
  // Any prior user gesture may allow the saved ringtone preference to play;
  // never request microphone/camera merely to enable a ringtone.
  document.addEventListener('pointerdown',()=>{if(ringEnabled&&(!ringCtx||ringCtx.state==='suspended'))void unlockRingtone();},{passive:true});
  document.addEventListener('keydown',()=>{if(ringEnabled&&(!ringCtx||ringCtx.state==='suspended'))void unlockRingtone();});
  try{ringEnabled=localStorage.getItem('vxsk-call-ringtone')!=='false';}catch(_){ringEnabled=true;}
  ringtoneUi();
  playMediaButton?.addEventListener('click',async()=>{
    if(!call)return;
    // An explicit click allows unmuted audio on browsers with autoplay protection.
    if(remoteAudio.srcObject)await tryPlayMedia(remoteAudio);
    if(call.medium==='video'&&remoteVideo.srcObject)await tryPlayMedia(remoteVideo);
    if(remoteAudio.srcObject&&!remoteAudio.paused){playNeedsGesture=false;playMediaButton.hidden=true;setStatus('Friend audio playing.');}
  });
  muteButton.addEventListener('click',()=>{
    const tracks=localMedia?.getAudioTracks()||[];
    if(!tracks.length)return;
    const muted=tracks.some(track=>track.enabled);
    tracks.forEach(track=>{track.enabled=!muted;});
    muteButton.textContent=muted?'UNMUTE MICROPHONE':'MUTE MICROPHONE';
    if(muted)myAvatar?.closest('.vxsk-voice-user')?.classList.remove('is-speaking');
  });
  cameraButton.addEventListener('click',()=>{
    const tracks=localMedia?.getVideoTracks()||[];if(!tracks.length)return;
    const enabled=tracks.some(track=>track.enabled);
    tracks.forEach(track=>{track.enabled=!enabled;});
    cameraButton.textContent=enabled?'CAMERA ON':'CAMERA OFF';
  });
  window.addEventListener('pagehide',()=>{if(call){const id=call.id;stopMedia();api()?.rpc('vxsk_friend_call_end',{p_call_id:id}).catch(()=>{});}});
  // Incoming invitations (4s) and connection/signaling updates (1.25s).
  setInterval(()=>{if(!call)void pollInbox();},4000);
  setInterval(()=>{if(call)void pollCall();},1250);
  setTimeout(()=>void pollInbox(),900);
  window.VXSKCalls=Object.freeze({start});
})();
