/* VXSK performance controls. Cosmetic only; never pauses an active WebRTC call. */
'use strict';
(() => {
  const key='vxsk-low-lag';
  let saved=false;
  try{saved=localStorage.getItem(key)==='1';}catch(_e){}
  const low=(enabled)=>{
    document.body.classList.toggle('vxsk-low-lag',enabled);
    const button=document.getElementById('vxsk-low-lag-toggle');
    if(button){button.setAttribute('aria-pressed',String(enabled));button.textContent=enabled?'⚡ LOW-LAG ON':'⚡ LOW-LAG OFF';}
    if(enabled)document.querySelectorAll('video.vxsk-hero-film,video.vxsk-ambient-film').forEach(v=>v.pause());
    document.dispatchEvent(new CustomEvent('vxsk:performance-mode'));
  };
  low(saved);
  document.getElementById('vxsk-low-lag-toggle')?.addEventListener('click',()=>{
    const next=!document.body.classList.contains('vxsk-low-lag');
    try{localStorage.setItem(key,next?'1':'0');}catch(_e){}
    low(next);
  });
  // Cosmetic site video only: WebRTC media elements have different classes and
  // must never be stopped when a call continues in the background.
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)document.querySelectorAll('video.vxsk-hero-film,video.vxsk-ambient-film').forEach(v=>v.pause());
  });
  if('serviceWorker' in navigator && location.protocol==='https:'){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
    },{once:true});
  }
})();
