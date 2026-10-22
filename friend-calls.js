'use strict';
// VXSK STAGING: Real WebRTC audio/video calls between accepted friends.
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
  let call=null, peerConnection=null, localMedia=null, remoteMedia=null, lastSignal=0;
  let collectingMedia=false, updating=false, checkingInbox=false;
  let signaling=Promise.resolve(), pendingIce=[], myId=null;

  function api(){return window.VXSKAuth?.client || null;}
  function setStatus(message){status.textContent=message;}
  function display(){
    if(panel.hidden){panel.hidden=false;try{panel.showModal();}catch(_){panel.hidden=false;}}
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
  }
  function stopMedia(){
    try{peerConnection?.close();}catch(_){} peerConnection=null;
    localMedia?.getTracks().forEach(track=>track.stop());localMedia=null;
    remoteMedia?.getTracks().forEach(track=>track.stop());remoteMedia=null;
    localVideo.srcObject=null;remoteVideo.srcObject=null;remoteAudio.srcObject=null;
    pendingIce=[];signaling=Promise.resolve();lastSignal=0;collectingMedia=false;
  }
  function dismiss(message=''){
    stopMedia();call=null;
    if(panel.open)panel.close();panel.hidden=true;
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
  async function startMedia(){
    if(!call||localMedia||collectingMedia)return;
    collectingMedia=true;
    try{
      if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==='undefined')
        throw Error('Your browser does not support secure audio/video calling.');
      setStatus('Asking your browser for '+(call.medium==='video'?'camera and microphone':'microphone')+' permission…');
      const stream=await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true},
        video:call.medium==='video'?{width:{ideal:640},height:{ideal:360},facingMode:'user'}:false
      });
      if(!call){stream.getTracks().forEach(t=>t.stop());return;}
      localMedia=stream;localVideo.srcObject=stream;
      if(call.medium==='video')localVideo.play().catch(()=>{});
      present();
      if(call.role==='callee'&&call.state==='ringing'){
        const accepted=await request('vxsk_friend_call_answer',{p_call_id:call.id,p_accept:true});
        if(!accepted)throw Error('This invitation is no longer available.');
        call.state='accepted';
        present();
      }
      makeConnection();
      setStatus('Connecting to your friend…');
      if(call.role==='caller'){
        const offer=await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        queueSignal('offer',{type:'offer',sdp:offer.sdp});
      }
    }catch(err){
      setStatus(err?.name==='NotAllowedError'?'Microphone/camera permission denied. Call cancelled.':(err.message||'Could not start the call.'));
      await endCall();
    }finally{collectingMedia=false;}
  }
  function makeConnection(){
    if(peerConnection||!localMedia)return;
    // STUN helps peers connect on different networks. Strict NATs may require a TURN server.
    const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    peerConnection=pc;
    localMedia.getTracks().forEach(track=>pc.addTrack(track,localMedia));
    pc.ontrack=event=>{
      if(!remoteMedia)remoteMedia=new MediaStream();
      if(!remoteMedia.getTracks().some(t=>t.id===event.track.id))remoteMedia.addTrack(event.track);
      const target=call?.medium==='video'?remoteVideo:remoteAudio;
      target.srcObject=remoteMedia;
      target.play().catch(()=>{setStatus('Tap your browser audio control to hear your friend.');});
    };
    pc.onicecandidate=event=>{
      if(event.candidate&&call?.state==='accepted')queueSignal('ice',event.candidate.toJSON());
    };
    pc.onconnectionstatechange=()=>{
      if(!call||peerConnection!==pc)return;
      if(pc.connectionState==='connected')setStatus('Connected · live '+call.medium+' call');
      else if(pc.connectionState==='disconnected')setStatus('Connection interrupted. Reconnecting…');
      else if(pc.connectionState==='failed')setStatus('Connection failed. This network may require a TURN relay; end and retry.');
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
      if(!Number.isSafeInteger(id))continue;
      if(id>lastSignal)lastSignal=id;
      if(item.kind==='ice'){
        if(item.body&&typeof item.body.candidate==='string')await iceCandidate(item.body);
      }else if(item.kind==='offer'&&call?.role==='callee'&&item.body?.type==='offer'){
        if(!peerConnection)makeConnection();
        if(!peerConnection||peerConnection.signalingState!=='stable')continue;
        await peerConnection.setRemoteDescription(item.body);
        await flushIce();
        const answer=await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        queueSignal('answer',{type:'answer',sdp:answer.sdp});
      }else if(item.kind==='answer'&&call?.role==='caller'&&item.body?.type==='answer'){
        if(peerConnection&&!peerConnection.remoteDescription){
          await peerConnection.setRemoteDescription(item.body);
          await flushIce();
        }
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
        call.state='accepted';present();
        if(call.role==='caller')await startMedia();
      }
      if(call.state==='accepted'&&Array.isArray(data.events))await consumeSignals(data.events);
    }catch(e){if(call?.id===id)setStatus(e.message||'Waiting for connection…');}
    finally{updating=false;}
  }
  async function pollInbox(){
    if(call||checkingInbox||document.hidden)return;
    checkingInbox=true;
    try{
      const u=await currentUser();if(!u){myId=null;return;}myId=u.id;
      const list=await request('vxsk_friend_call_inbox');
      if(call||!Array.isArray(list))return;
      const incoming=list.find(x=>x.callee===myId&&x.state==='ringing');
      if(incoming){
        call={id:incoming.id,role:'callee',peerId:incoming.peer_id,medium:incoming.medium,name:incoming.peer_name||'VXSK FRIEND',state:'ringing'};
        setStatus('Incoming call. Camera and microphone stay OFF until you accept.');present();
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
      setStatus('Calling… Your microphone/camera will only start if your friend accepts.');present();
    }catch(e){const feedback=$('community-feedback');if(feedback)feedback.textContent=e.message;}
  }
  acceptButton.addEventListener('click',async()=>{
    if(call?.role!=='callee'||call.state!=='ringing')return;
    acceptButton.disabled=true;
    try{await startMedia();}finally{acceptButton.disabled=false;}
  });
  declineButton.addEventListener('click',declineCall);
  hangupButton.addEventListener('click',endCall);
  closeButton.addEventListener('click',()=>call?.role==='callee'&&call.state==='ringing'?declineCall():endCall());
  panel.addEventListener('cancel',event=>{event.preventDefault();call?.role==='callee'&&call.state==='ringing'?declineCall():endCall();});
  muteButton.addEventListener('click',()=>{
    const tracks=localMedia?.getAudioTracks()||[];
    if(!tracks.length)return;
    const muted=tracks.some(track=>track.enabled);
    tracks.forEach(track=>{track.enabled=!muted;});
    muteButton.textContent=muted?'UNMUTE MICROPHONE':'MUTE MICROPHONE';
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
