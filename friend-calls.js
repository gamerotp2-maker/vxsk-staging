'use strict';
// VXSK STAGING V12.8.17: fullscreen call stage and consented screen/tab audio sharing.
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
  const remoteShareAudio=$('vxsk-share-audio'), fullStage=$('vxsk-call-stage'), fullscreenButton=$('vxsk-call-fullscreen');
  const networkButton=$('vxsk-call-network'), networkInfo=$('vxsk-call-network-info');
  const screenButton=$('vxsk-call-share'),shareLabel=$('vxsk-call-share-label');
  let call=null, peerConnection=null, localMedia=null, remoteMedia=null, lastSignal=0;
  let collectingMedia=false, updating=false, checkingInbox=false;
  let signaling=Promise.resolve(), pendingIce=[], myId=null;
  let videoDescriptionQueued=false, videoIceBuffer=[], playNeedsGesture=false, iceReady=false;
  const dock=$('vxsk-call-dock'), dockTitle=$('vxsk-call-dock-title'), dockStatus=$('vxsk-call-dock-status');
  const ringToggle=$('vxsk-call-ringtone-toggle');
  const myAvatar=$('vxsk-call-my-avatar'),peerAvatar=$('vxsk-call-peer-avatar');
  const myName=$('vxsk-call-my-name'),peerName=$('vxsk-call-peer-name'),voices=$('vxsk-call-voices');
  let minimized=false,ringEnabled=false,playingTone='';
  // Original VXSK tones are ordinary HTML media: generally less vulnerable to
  // animation timer throttling than repeated synthesized oscillator callbacks.
  // Background sound is still controlled by the browser and operating system.
  const tones={incoming:new Audio('assets/vxsk-incoming-ring.wav'),outgoing:new Audio('assets/vxsk-outgoing-ring.wav')};
  for(const el of Object.values(tones)){el.loop=true;el.preload='auto';}
  tones.incoming.volume=.9;tones.outgoing.volume=.65;
  // Free-only VXSK staging: STUN needs no account or billing. To enable TURN
  // later, change this flag only after configuring secure server-side credentials.
  const freeStunOnly=true;
  const freeStunServers=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302']}];
  let iceServers=freeStunServers,hasTurn=false,iceRetry=0,iceRetryTimer=null,iceRestarting=false;
  let videoSender=null,screenAudioSender=null,shareStream=null,shareTrack=null,shareAudioTrack=null,sharing=false,sharingAudio=false,friendScreen=false,friendSharingAudio=false;
  let callStartedAt=0;
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
    if(document.fullscreenElement===fullStage)void document.exitFullscreen().catch(()=>{});
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
    for(const audio of Object.values(tones)){if(!audio.paused)audio.pause();audio.currentTime=0;}
    playingTone='';
  }
  function updateRingtone(){
    const wanted=ringEnabled&&call?.state==='ringing' ? (call.role==='callee'?'incoming':'outgoing'):'';
    if(wanted===playingTone && (!wanted||!tones[wanted].paused))return;
    stopTones();
    if(!wanted)return;
    playingTone=wanted;
    tones[wanted].play().catch(()=>{
      if(!call||call.state!=='ringing')return;
      const text='Call alert sound is blocked by your browser. Click RING ON and allow sound for VXSK.';
      if(status.textContent.indexOf(text)<0)setStatus(text);
    });
  }
  async function getIceServers(){
    const fallback=freeStunServers;
    // Avoid an unnecessary Edge Function request (and up to 6s delay)
    // when no paid TURN provider is configured for this free-only build.
    if(freeStunOnly)return {servers:fallback,relay:false};
    // TURN keys stay server-side in the Supabase Edge Function. The browser only
    // gets temporary scoped ICE credentials if a real active call is authorized.
    const instance=api();
    if(!instance?.functions?.invoke||!call?.id)return {servers:fallback,relay:false};
    try{
      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),6000));
      const reply=await Promise.race([instance.functions.invoke('vxsk-turn-credentials',{body:{call_id:call.id}}),timeout]);
      if(reply?.error||!Array.isArray(reply?.data?.iceServers))return {servers:fallback,relay:false};
      const servers=reply.data.iceServers.filter(entry=>{
        if(!entry||!(typeof entry.urls==='string'||Array.isArray(entry.urls)))return false;
        const urls=Array.isArray(entry.urls)?entry.urls:[entry.urls];
        return urls.length>0&&urls.length<=8&&urls.every(u=>typeof u==='string'&&/^(stun|turn|turns):/i.test(u)&&u.length<256);
      }).slice(0,6);
      const relay=servers.some(entry=>String(entry.urls).includes('turn:')||String(entry.urls).includes('turns:'));
      return {servers:servers.length?servers:fallback,relay};
    }catch(_){return {servers:fallback,relay:false};}
  }
  async function tryIceRestart(){
    const pc=peerConnection,id=call?.id;
    if(!pc||!call||call.state!=='accepted'||pc.signalingState==='closed'||call.role!=='caller'||iceRestarting)return;
    if(iceRetry>=2){setStatus(hasTurn?'Call recovery failed. Please end and retry on a stable connection.':'Connection could not be restored. A TURN relay may be required for these networks.');return;}
    iceRestarting=true;iceRetry++;
    setStatus('Reconnecting call… attempt '+iceRetry+' of 2.');
    try{
      if(!hasTurn){const config=await getIceServers();if(call?.id!==id||peerConnection!==pc)return;
        if(config.relay){iceServers=config.servers;hasTurn=true;pc.setConfiguration({iceServers});}}
      if(pc.signalingState!=='stable')return;
      pendingIce=[];videoDescriptionQueued=false;
      const offer=await pc.createOffer({iceRestart:true});
      await pc.setLocalDescription(offer);
      await waitForVideoIce(pc);
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
    const camera=localMedia?.getVideoTracks()?.[0]||null;
    if(videoSender&&peerConnection?.signalingState!=='closed')void videoSender.replaceTrack(camera).catch(()=>{});
    if(screenAudioSender&&peerConnection?.signalingState!=='closed')void screenAudioSender.replaceTrack(null).catch(()=>{});
    if(old)old.onended=null;
    if(oldAudio)oldAudio.onended=null;
    shareStream?.getTracks()?.forEach(t=>t.stop());shareStream=null;
    if(localVideo)localVideo.srcObject=localMedia;
    updateScreenUi();
  }
  function updateScreenUi(){
    if(!call)return;
    if(screenButton){screenButton.hidden=call.state!=='accepted'||!peerConnection;screenButton.textContent=sharing?'STOP SHARING':'SHARE SCREEN';}
    if(shareLabel){shareLabel.hidden=!sharing&&!friendScreen;shareLabel.textContent=sharing?(sharingAudio?'YOU ARE SHARING + SOUND':'YOU ARE SHARING SCREEN'):(friendSharingAudio?'FRIEND IS SHARING + SOUND':'FRIEND IS SHARING SCREEN');}
    mediaBox.hidden=(!localMedia||call.medium!=='video')&&!sharing&&!friendScreen;
  }
  async function startScreenShare(){
    if(!call||call.state!=='accepted'||!peerConnection||!videoSender)return;
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
      await videoSender.replaceTrack(track);changedVideo=true;
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
      track.onended=()=>{if(shareTrack===track)stopScreenShare();};
      if(audioTrack)audioTrack.onended=()=>{
        if(shareAudioTrack===audioTrack){
          shareAudioTrack=null;sharingAudio=false;
          if(screenAudioSender&&peerConnection?.signalingState!=='closed')void screenAudioSender.replaceTrack(null).catch(()=>{});
          updateScreenUi();setStatus('Screen share continues without sound.');
        }
      };
      localVideo.srcObject=new MediaStream([track]);
      void localVideo.play().catch(()=>{});
      updateScreenUi();
      setStatus(audioTrack?
        'Sharing your screen and its audio. Your microphone stays independent.':
        'Sharing screen WITHOUT audio: if your browser offers it, select a tab and check Share tab audio, then try again.');
    }catch(e){
      if(changedVideo&&videoSender&&peerConnection===startingPc){
        void videoSender.replaceTrack(localMedia?.getVideoTracks()?.[0]||null).catch(()=>{});
      }
      if(captured)captured.getTracks().forEach(t=>t.stop());
      if(e?.name!=='NotAllowedError')setStatus('Screen sharing could not start'+(e?.name?' ('+e.name+')':'')+'. Try sharing a browser tab.');
    }
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
    const community=window.VXSKCommunity;
    if(community?.refreshFriendAvatar)void community.refreshFriendAvatar(peerAvatar,call.peerId);
    else if(community?.addFriendAvatar)void community.addFriendAvatar(peerAvatar,call.peerId);
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
    updateScreenUi();
    if(voices)voices.hidden=call.medium!=='audio'||call.state!=='accepted';
    if(playMediaButton)playMediaButton.hidden=call.state!=='accepted'||!playNeedsGesture;
    if(fullscreenButton)fullscreenButton.hidden=call.state!=='accepted';
    if(networkButton)networkButton.hidden=call.state!=='accepted';
    updateRingtone();mini();
  }
  function stopMedia(){
    clearMeters();
    stopTones();
    if(iceRetryTimer)clearTimeout(iceRetryTimer);iceRetryTimer=null;iceRetry=0;iceRestarting=false;
    if(document.fullscreenElement===fullStage)void document.exitFullscreen().catch(()=>{});
    stopScreenShare();videoSender=null;screenAudioSender=null;friendScreen=false;friendSharingAudio=false;
    try{peerConnection?.close();}catch(_){} peerConnection=null;
    localMedia?.getTracks().forEach(track=>track.stop());localMedia=null;
    remoteMedia?.getTracks().forEach(track=>track.stop());remoteMedia=null;
    localVideo.srcObject=null;remoteVideo.srcObject=null;remoteAudio.srcObject=null;
    if(remoteShareAudio)remoteShareAudio.srcObject=null;
    pendingIce=[];signaling=Promise.resolve();lastSignal=0;collectingMedia=false;
    videoDescriptionQueued=false;videoIceBuffer=[];playNeedsGesture=false;iceReady=false;hasTurn=false;iceServers=freeStunServers;
    if(playMediaButton)playMediaButton.hidden=true;
    if(networkButton)networkButton.hidden=true;
    if(fullscreenButton){fullscreenButton.hidden=true;fullscreenButton.textContent='FULLSCREEN ⛶';fullscreenButton.setAttribute('aria-pressed','false');}
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
      const config=await getIceServers();
      if(call?.id!==startedCallId)return;
      iceServers=config.servers;hasTurn=config.relay;iceReady=true;
      makeConnection();
      setStatus(hasTurn?'Connecting securely through STUN/TURN…':'Connecting directly… relay not configured.');
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
    const pc=new RTCPeerConnection({iceServers,bundlePolicy:'max-bundle'});
    peerConnection=pc;
    localMedia.getTracks().forEach(track=>{const sender=pc.addTrack(track,localMedia);if(track.kind==='video')videoSender=sender;});
    // Reserve video on audio-only calls and a *second* audio transceiver on all
    // calls. Screen audio never replaces the microphone and requires no new SDP.
    if(!videoSender)videoSender=pc.addTransceiver('video',{direction:'sendrecv'}).sender;
    screenAudioSender=pc.addTransceiver('audio',{direction:'sendrecv'}).sender;
    updateScreenUi();
    pc.ontrack=event=>{
      if(!call||peerConnection!==pc)return;
      // Second negotiated audio m-line carries optional shared-tab sound.
      // Keep it off the microphone <audio> element so that both can play.
      if(event.track.kind==='audio'){
        const receivers=pc.getTransceivers?.().filter(t=>t.receiver?.track?.kind==='audio')||[];
        const isSharedAudio=receivers.length>1&&receivers[1]?.receiver?.track===event.track;
        if(isSharedAudio){
          const sharedTrack=event.track;
          const show=()=>{
            if(peerConnection!==pc||!call)return;
            friendSharingAudio=true;
            if(remoteShareAudio){remoteShareAudio.srcObject=new MediaStream([sharedTrack]);void tryPlayMedia(remoteShareAudio);}
            updateScreenUi();
          };
          const hide=()=>{
            friendSharingAudio=false;
            if(remoteShareAudio)remoteShareAudio.srcObject=null;
            updateScreenUi();
          };
          sharedTrack.addEventListener('unmute',show);
          sharedTrack.addEventListener('mute',hide);
          sharedTrack.addEventListener('ended',hide);
          if(!sharedTrack.muted)show();
          return;
        }
      }
      if(!remoteMedia)remoteMedia=new MediaStream();
      if(!remoteMedia.getTracks().some(t=>t.id===event.track.id))remoteMedia.addTrack(event.track);
      if(call.medium==='audio'&&event.track.kind==='audio'){remoteAnalyser=meter(remoteMedia);initMeter();}
      if(event.track.kind==='video'){
        const show=()=>{if(peerConnection!==pc||!call)return;friendScreen=call.medium==='audio';updateScreenUi();};
        const hide=()=>{if(call&&call.medium==='audio'){friendScreen=false;updateScreenUi();}};
        event.track.addEventListener('unmute',show);event.track.addEventListener('mute',hide);
        if(!event.track.muted)show();
        remoteVideo.srcObject=new MediaStream([event.track]);void tryPlayMedia(remoteVideo);
      }
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
      }else if(event.track.kind==='audio'){
        // Preserve the already-working audio-only path from V12.8.12.
        remoteAudio.srcObject=new MediaStream(remoteMedia.getAudioTracks());
        remoteAudio.play().catch(()=>{showMediaPlaybackNeeded();});
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
        scheduleIceRecovery('connected');
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
          if(item.body&&typeof item.body.candidate==='string')await iceCandidate(item.body);
        }else if(item.kind==='offer'&&call?.role==='callee'&&item.body?.type==='offer'){
          if(!localMedia||!iceReady)break; // Await media + TURN config; do not create a STUN-only peer by race.
          if(!peerConnection)makeConnection();
          if(!peerConnection||peerConnection.signalingState!=='stable')break;
          await peerConnection.setRemoteDescription(item.body);
          await flushIce();
          await peerConnection.setLocalDescription(await peerConnection.createAnswer());
          if(call.medium==='video')await waitForVideoIce(peerConnection);
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
      remoteVideo:remoteMedia?.getVideoTracks().filter(t=>t.readyState==='live').length||0,
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
      'Friend shared sound: '+(summary.sharedAudioPlaying?'playing':'not sharing or blocked')
    ];
    if(!hasTurn)lines.push('Free STUN-only mode: some networks cannot make direct calls without a relay.');
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
  });
  function syncFullscreenButton(){
    if(!fullscreenButton)return;
    const active=document.fullscreenElement===fullStage;
    fullscreenButton.textContent=active?'EXIT FULLSCREEN ↙':'FULLSCREEN ⛶';
    fullscreenButton.setAttribute('aria-pressed',String(active));
  }
  fullscreenButton?.addEventListener('click',async()=>{
    if(!call||call.state!=='accepted'||!fullStage)return;
    try{
      if(document.fullscreenElement===fullStage)await document.exitFullscreen();
      else if(!document.fullscreenElement&&fullStage.requestFullscreen)await fullStage.requestFullscreen();
      else setStatus('Exit the other fullscreen view before opening VXSK fullscreen.');
    }catch(_){setStatus('Fullscreen is not available in this browser. Try a desktop browser.');}
    syncFullscreenButton();
  });
  document.addEventListener('fullscreenchange',syncFullscreenButton);
  screenButton?.addEventListener('click',()=>{if(sharing)stopScreenShare();else void startScreenShare();});
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
