/* VXSK cinematic showcase: play at most one visible 16:9 source at a time. */
'use strict';
(() => {
  const scenes=[...document.querySelectorAll('[data-cinema]')];
  if(!scenes.length)return;
  let current=null, manualPaused=new WeakSet(), audioScene=null;
  const dataSaver=Boolean(navigator.connection?.saveData);
  const prefersMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const loaded=new WeakSet();
  const videoOf=scene=>scene.querySelector('video');
  const stateOf=scene=>scene.querySelector('.vxsk-cinema-state');
  const buttonOf=scene=>scene.querySelector('[data-cinema-toggle]');
  const soundOf=scene=>scene.querySelector('[data-cinema-sound]');
  const ensureLoaded=scene=>{
    if(loaded.has(scene))return;
    const video=videoOf(scene),src=video.querySelector('source[data-src]');
    if(!src)return;
    src.src=src.dataset.src;src.removeAttribute('data-src');
    video.preload='metadata';video.load();loaded.add(scene);
  };
  const refresh=scene=>{
    const video=videoOf(scene), button=buttonOf(scene),sound=soundOf(scene);
    button.textContent=video.paused?'▶ PLAY':'Ⅱ PAUSE';
    button.setAttribute('aria-label',(video.paused?'Play':'Pause')+' '+video.getAttribute('aria-label'));
    sound.textContent=video.muted?'🔇 SOUND OFF':'🔊 SOUND ON';
    sound.setAttribute('aria-pressed',String(!video.muted));
    if(video.error)stateOf(scene).textContent='VIDEO UNAVAILABLE · TRY OPEN FULL VIDEO';
    else if(video.readyState>=2&&!video.paused)stateOf(scene).textContent='● LIVE PREVIEW · 1080p';
    else if(video.readyState>=1)stateOf(scene).textContent='PAUSED · READY';
    else stateOf(scene).textContent='PREVIEW READY';
  };
  const pauseScene=scene=>{const video=videoOf(scene);video.pause();if(audioScene===scene)audioScene=null;video.muted=true;refresh(scene);};
  const start=async(scene,fromClick=false)=>{
    if(current&&current!==scene)pauseScene(current);
    current=scene;
    ensureLoaded(scene);
    const video=videoOf(scene);
    if(fromClick)manualPaused.delete(scene);
    try{await video.play();}catch(_){stateOf(scene).textContent='TAP PLAY TO WATCH';}
    refresh(scene);
  };
  for(const scene of scenes){
    const video=videoOf(scene);
    video.muted=true;
    video.addEventListener('play',()=>refresh(scene));
    video.addEventListener('pause',()=>refresh(scene));
    video.addEventListener('error',()=>refresh(scene));
    video.addEventListener('loadedmetadata',()=>refresh(scene));
    buttonOf(scene).addEventListener('click',()=>{
      if(video.paused)void start(scene,true);
      else{manualPaused.add(scene);pauseScene(scene);}
    });
    soundOf(scene).addEventListener('click',async()=>{
      ensureLoaded(scene);
      if(video.muted){
        for(const other of scenes)if(other!==scene){videoOf(other).muted=true;refresh(other);}
        video.muted=false;video.volume=.55;audioScene=scene;
        if(video.paused)await start(scene,true);
      }else{video.muted=true;audioScene=null;}
      refresh(scene);
    });
    refresh(scene);
  }
  if(!('IntersectionObserver'in window))return;
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
      const scene=entry.target;
      // Recheck the LIVE layout instead of a queued observer entry: scrolling to a
      // Play button can otherwise deliver an old offscreen entry and stop the video.
      const rect=scene.getBoundingClientRect();
      const trulyAway=rect.bottom < -100 || rect.top > window.innerHeight + 100;
      if(trulyAway && !videoOf(scene).paused)pauseScene(scene);
    }
    if(document.hidden||dataSaver||prefersMotion)return;
    const visible=scenes.filter(s=>{
      const rect=s.getBoundingClientRect();
      return rect.top<window.innerHeight*.82&&rect.bottom>window.innerHeight*.28;
    });
    if(!visible.length)return;
    const winner=visible.sort((a,b)=>Math.abs(a.getBoundingClientRect().top-window.innerHeight*.08)-Math.abs(b.getBoundingClientRect().top-window.innerHeight*.08))[0];
    if(!manualPaused.has(winner)&&videoOf(winner).paused)void start(winner);
  },{threshold:[0,.27,.6],rootMargin:'200px 0px 200px 0px'});
  for(const scene of scenes)observer.observe(scene);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){for(const scene of scenes)if(!videoOf(scene).paused)pauseScene(scene);}
  });
})();
