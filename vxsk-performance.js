/* VXSK V12.8.19: no-flicker low-lag mode. Cosmetic only; WebRTC is untouched. */
'use strict';
(() => {
  const key = 'vxsk-low-lag';
  let saved = document.documentElement.classList.contains('vxsk-low-lag');
  try { saved = localStorage.getItem(key) === '1'; } catch (_) {}

  function setMode(enabled) {
    // Switch visibility to the fixed poster BEFORE pausing decoded video frames.
    document.documentElement.classList.toggle('vxsk-low-lag', enabled);
    document.body.classList.toggle('vxsk-low-lag', enabled);
    const button = document.getElementById('vxsk-low-lag-toggle');
    if (button) {
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = enabled ? '⚡ LOW-LAG ON' : '⚡ LOW-LAG OFF';
    }
    if (enabled) {
      document.querySelectorAll('video.vxsk-hero-film, video.vxsk-ambient-film').forEach(video => {
        video.classList.remove('vxsk-film-ready');
        video.pause();
      });
    }
    // Let motion.js manage the cosmetic movie when mode is turned OFF.
    document.dispatchEvent(new CustomEvent('vxsk:performance-mode'));
  }

  setMode(saved);
  document.getElementById('vxsk-low-lag-toggle')?.addEventListener('click', () => {
    const next = !document.body.classList.contains('vxsk-low-lag');
    try { localStorage.setItem(key, next ? '1' : '0'); } catch (_) {}
    setMode(next);
  });

  // Never pause/modify RTC call tracks; only the muted decorative site film.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    document.querySelectorAll('video.vxsk-hero-film, video.vxsk-ambient-film').forEach(video => {
      video.classList.remove('vxsk-film-ready');
      video.pause();
    });
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    }, { once: true });
  }
})();
