/* VXSK STEP 3 — video is a clear background to real page sections.
   One visible clip maximum; lazy source loading; data-saver and reduced-motion safe.
   No user/social/staff/auth logic is touched. */
'use strict';
(() => {
  const scenes=[...document.querySelectorAll('[data-vxsk-world]')];
  if(!scenes.length)return;
  const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const connection=navigator.connection;
  const manuallyPaused=new WeakSet();
  let current=null;
  let busy=false;
  const $=(scene,s)=>scene.querySelector(s);
  const film=scene=>$(scene,'video.vxsk-world-film');
  const lowLag=()=>document.documentElement.classList.contains('vxsk-low-lag')||document.body.classList.contains('vxsk-low-lag');
  const allowAutoplay=()=>!document.hidden&&!lowLag()&&!media?.matches&&!connection?.saveData;
  function ensure(scene){
    const v=film(scene);if(v.dataset.vxskLoaded)return;
    const source=v.querySelector('source[data-src]');if(!source)return;
    source.src=source.dataset.src;source.removeAttribute('data-src');
    v.preload='metadata';v.dataset.vxskLoaded='1';v.load();
  }
  function update(scene){
    const v=film(scene),button=$(scene,'[data-world-toggle]'),status=$(scene,'.vxsk-world-playback');
    const playing=!v.paused&&!v.ended&&v.readyState>=2;
    button.textContent=playing?'Ⅱ PAUSE MOTION':'▶ PLAY MOTION';
    button.setAttribute('aria-pressed',String(playing));
    button.setAttribute('aria-label',playing?'Pause background video':'Play background video');
    if(v.error)status.textContent='VIDEO UNAVAILABLE · USE FULL CLIP';
    else if(playing)status.textContent='● BACKGROUND PLAYING · MUTED';
    else if(v.dataset.vxskLoaded)status.textContent='BACKGROUND PAUSED';
    else status.textContent='BACKGROUND VIDEO · READY';
  }
  function pause(scene){
    const v=film(scene);v.pause();v.muted=true;update(scene);
    if(current===scene)current=null;
  }
  async function play(scene,manual=false){
    if(manual)manuallyPaused.delete(scene);
    if(!manual&&!allowAutoplay())return;
    for(const other of scenes)if(other!==scene&&!film(other).paused)pause(other);
    ensure(scene);
    const v=film(scene);
    current=scene;
    try{await v.play()}catch(_){/* Browser blocks autoplay or media failed; poster & button stay visible. */}
    update(scene);
  }
  function onscreen(scene){
    const r=scene.getBoundingClientRect(),h=window.innerHeight||700;
    return r.bottom>h*.18 && r.top<h*.82;
  }
  function sync(){
    if(busy)return;busy=true;
    requestAnimationFrame(()=>{
      busy=false;
      if(!allowAutoplay()){
        for(const scene of scenes)if(!film(scene).paused)pause(scene);
        return;
      }
      const visible=scenes.filter(onscreen);
      if(!visible.length){for(const scene of scenes)if(!film(scene).paused)pause(scene);return;}
      const mid=(window.innerHeight||700)/2;
      visible.sort((a,b)=>Math.abs((a.getBoundingClientRect().top+a.getBoundingClientRect().bottom)/2-mid)-Math.abs((b.getBoundingClientRect().top+b.getBoundingClientRect().bottom)/2-mid));
      const winner=visible[0];
      for(const scene of scenes)if(scene!==winner&&!film(scene).paused)pause(scene);
      if(!manuallyPaused.has(winner)&&film(winner).paused)void play(winner);
    });
  }
  for(const scene of scenes){
    const v=film(scene),b=$(scene,'[data-world-toggle]');
    v.muted=true;
    b.addEventListener('click',()=>{
      if(v.paused)void play(scene,true);
      else{manuallyPaused.add(scene);pause(scene);}
    });
    for(const type of ['playing','pause','loadeddata','error'])v.addEventListener(type,()=>update(scene));
    update(scene);
  }
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(sync,{threshold:[0,.12,.35,.6],rootMargin:'120px 0px 120px 0px'});
    scenes.forEach(s=>observer.observe(s));
  }else window.addEventListener('scroll',sync,{passive:true});
  window.addEventListener('resize',sync,{passive:true});
  document.addEventListener('visibilitychange',sync);
  document.addEventListener('vxsk:performance-mode',sync);
  media?.addEventListener?.('change',sync);
  connection?.addEventListener?.('change',sync);
  window.addEventListener('pagehide',()=>scenes.forEach(pause),{once:true});
  sync();
})();
