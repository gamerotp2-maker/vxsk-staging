/* VXSK V12.8.34: ICE/TURN bootstrap + privacy-safe WebRTC RTT diagnostics.
   Browser never stores long-term TURN keys. TURN is optional until configured. */
'use strict';
(() => {
  const STUN = Object.freeze([{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302','stun:stun2.l.google.com:19302']}]);
  const cache=new Map();
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function validIce(entry){
    if(!entry||!(typeof entry.urls==='string'||Array.isArray(entry.urls)))return false;
    const urls=Array.isArray(entry.urls)?entry.urls:[entry.urls];
    if(!urls.length||urls.length>10||!urls.every(u=>typeof u==='string'&&/^(stun|turn|turns):[^\s]+$/i.test(u)&&u.length<255))return false;
    if(urls.some(u=>/^(turn|turns):/i.test(u)))return typeof entry.username==='string'&&entry.username.length<256&&typeof entry.credential==='string'&&entry.credential.length<256;
    return true;
  }
  async function ice(api,{kind,id}){
    const fallback={servers:STUN,relay:false,source:'stun-only'};
    if(!api?.functions?.invoke||!['friend','group'].includes(kind)||!UUID.test(id||''))return fallback;
    const key=kind+':'+id, cached=cache.get(key);
    if(cached&&cached.expires>Date.now())return cached.value;
    let timer;
    try{
      const response=await Promise.race([
        api.functions.invoke('vxsk-turn-credentials',{body:{kind,id}}),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('TURN endpoint timeout')),6000);})
      ]);
      if(response.error||!Array.isArray(response.data?.iceServers))return fallback;
      const list=response.data.iceServers.filter(validIce).slice(0,10);
      const relay=list.some(s=>(Array.isArray(s.urls)?s.urls:[s.urls]).some(url=>/^turns?:/i.test(url)));
      if(!relay)return fallback;
      const value={servers:[...STUN,...list],relay:true,source:'turn-ready'};
      // Cached much less than temporary credential TTL. Renew on a new call / restart.
      cache.set(key,{value,expires:Date.now()+8*60*1000});
      return value;
    }catch(_){return fallback;}
    finally{if(timer)clearTimeout(timer);}
  }
  async function connectionStats(pc){
    if(!pc||pc.signalingState==='closed')return {ms:null,path:'unknown'};
    try{
      const stats=await pc.getStats();
      let pair=null;
      stats.forEach(item=>{if(item.type==='transport'&&item.selectedCandidatePairId)pair=stats.get(item.selectedCandidatePairId)||pair;});
      if(!pair)stats.forEach(item=>{if(item.type==='candidate-pair'&&item.state==='succeeded'&&item.nominated)pair=item;});
      if(!pair)return {ms:null,path:'unknown'};
      const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId);
      const path=local?.candidateType==='relay'||remote?.candidateType==='relay'?'relay':local?.candidateType||remote?.candidateType?'direct':'unknown';
      const seconds=Number(pair.currentRoundTripTime);
      const ms=Number.isFinite(seconds)&&seconds>=0&&seconds<60?Math.round(seconds*1000):null;
      return {ms,path};
    }catch(_){return {ms:null,path:'unknown'};}
  }
  window.VXSKCallNetwork=Object.freeze({ice,connectionStats,STUN});
})();
