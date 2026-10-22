'use strict';
// Independent motion engine. No registration/account code runs here.
// Progressive enhancement: if JS fails, sections stay visible by default.
(() => {
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion = media.matches;
  const panels = Array.from(document.querySelectorAll('.reveal'));
  const revealAll = () => panels.forEach(el => el.classList.add('visible'));

  if (!reduceMotion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    }, {threshold: .08, rootMargin: '0px 0px 25px 0px'});
    root.classList.add('motion-ready');
    panels.forEach(el => observer.observe(el));
    // Don't hide content forever if browser backgrounding throttles observers.
    window.addEventListener('pagehide', revealAll, {once:true});
  } else {
    revealAll();
  }


// VXSK gameplay ambience: low-bandwidth user clips, muted and purely decorative.
// Never download/play on Save-Data, reduced-motion, or hidden tabs.
const film = document.querySelector('.vxsk-hero-film[data-cinematic-src]');
if (film) {
  const saveData = Boolean(navigator.connection?.saveData);
  const src = film.dataset.cinematicSrc;
  let activated = false;
  let onscreen = true;
  const canPlay = () => !media.matches && !saveData && !document.hidden && onscreen && !document.body.classList.contains('vxsk-low-lag');
  const syncVideo = () => {
    if (!canPlay()) { film.pause(); return; }
    if (!activated) { film.src = src; activated = true; }
    film.play().catch(() => {}); // Poster remains available when autoplay is blocked.
  };
  if ('IntersectionObserver' in window) {
    onscreen = false;
    const videoObserver = new IntersectionObserver(entries => {
      onscreen = Boolean(entries[0]?.isIntersecting);
      syncVideo();
    }, {rootMargin: '150px 0px', threshold: 0});
    videoObserver.observe(film);
  } else syncVideo();
  document.addEventListener('visibilitychange', syncVideo);
  document.addEventListener('vxsk:performance-mode', syncVideo);
  media.addEventListener?.('change', syncVideo);
  film.addEventListener('error', () => { film.pause(); film.removeAttribute('src'); film.load(); });
}

  const progress = document.getElementById('scroll-progress');
  let requested = false;
  function paintProgress() {
    if (progress) {
      const available = document.documentElement.scrollHeight - innerHeight;
      progress.style.width = `${available > 0 ? Math.min(100,scrollY / available * 100) : 0}%`;
    }
    requested = false;
  }
  addEventListener('scroll', () => {
    if (!requested) {
      requested = true;
      requestAnimationFrame(paintProgress);
    }
  }, {passive:true});
  addEventListener('resize', paintProgress, {passive:true});
  paintProgress();

  if (!reduceMotion) {
    const particles = document.getElementById('particles');
    if (particles) {
      const count = Math.min(34, Math.max(12, Math.floor(innerWidth / 37)));
      const fragment = document.createDocumentFragment();
      for (let i=0; i<count; i++) {
        const star = document.createElement('span');
        star.className = 'particle';
        star.style.left = `${Math.random()*100}%`;
        star.style.top = `${Math.random()*100}%`;
        star.style.setProperty('--speed',`${6+Math.random()*12}s`);
        star.style.setProperty('--delay',`${-Math.random()*12}s`);
        fragment.append(star);
      }
      particles.append(fragment);
    }
  }
})();
