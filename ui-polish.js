'use strict';
// VXSK cosmetic-only enhancement. Never handles credentials, authorization, or submissions.
(() => {
  const svg = (inner, size=18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
  const fieldIcons = {
    'form-game': '<path d="M6 9h12a4 4 0 0 1 3.8 3l.7 4.7a2.4 2.4 0 0 1-4 2.2l-2.5-2.3H8L5.5 19a2.4 2.4 0 0 1-4-2.2L2.2 12A4 4 0 0 1 6 9Z"/><path d="M7 11v5m-2.5-2.5h5M16 12h.01M19 14h.01"/>',
    'form-mode': '<path d="m12 2 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 16l9 5 9-5"/>',
    'form-rank': '<path d="M7 4h10v6a5 5 0 0 1-10 0V4Zm0 2H4v3a4 4 0 0 0 4 4m9-7h3v3a4 4 0 0 1-4 4M12 15v4m-4 2h8"/>',
    'form-player': '<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
    'form-platform': '<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 22h8m-4-4v4"/>',
    'form-region': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-4 5-4 13 0 18m0-18c4 5 4 13 0 18"/>',
    'form-contact-type': '<path d="M4 4h16v12H8l-4 4V4Z"/><path d="M8 9h8m-8 3h5"/>',
    'form-contact': '<path d="M3 6h18v12H3z"/><path d="m3 7 9 7 9-7"/>',
    'form-notes': '<path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/>',
    'form-team': '<path d="M4 20v-2a5 5 0 0 1 10 0v2M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-4a3 3 0 0 1 0 6m0 3c2 0 4 1 4 3"/>',
    'signin-email': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
    'signup-email': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
    'forgot-email': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
    'signin-password': '<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v3"/>',
    'signup-password': '<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v3"/>',
    'signup-confirm': '<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v3"/>',
    'reset-password': '<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v3"/>',
    'reset-confirm': '<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v3"/>',
    'rival-game': '<path d="M6 9h12a4 4 0 0 1 3 4l.5 4a2 2 0 0 1-3.5 1l-2-2H8l-2 2a2 2 0 0 1-3.5-1L3 13a4 4 0 0 1 3-4Z"/>',
    'rival-rank': '<path d="M7 4h10v6a5 5 0 0 1-10 0V4ZM12 15v5m-5 1h10"/>',
    'rival-name': '<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
    'rival-discord': '<path d="M4 5h16v12H9l-5 4V5Z"/>',
    'rival-region': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-4 5-4 13 0 18"/>',
    'rival-mode': '<path d="m12 2 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5"/>',
    'rival-availability': '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>'
  };
  for (const [control, path] of Object.entries(fieldIcons)) {
    const label = document.querySelector(`label[for="${control}"]`);
    if (!label || label.querySelector('.vxsk-field-ico')) continue;
    const container = document.createElement('span');
    container.className = 'vxsk-field-ico';
    container.setAttribute('aria-hidden', 'true');
    container.innerHTML = svg(path,15); // Static SVG literals, not user data.
    label.prepend(container);
  }

  // The native select stays keyboard- and screen-reader-accessible. Tiles are shortcuts.
  const rankLists = {
    'Rocket League': ['Unranked','Bronze','Silver','Gold','Platinum','Diamond','Champion','Grand Champion','Supersonic Legend'],
    'VALORANT': ['Unranked','Iron','Bronze','Silver','Gold','Platinum','Diamond','Ascendant','Immortal','Radiant'],
    'League of Legends': ['Unranked','Iron','Bronze','Silver','Gold','Platinum','Emerald','Diamond','Master','Grandmaster','Challenger']
  };
  const games = {
    'Rocket League': {prefix:'rl', icon:'assets/rl-logo.webp'},
    'VALORANT': {prefix:'val', icon:'assets/valorant-logo.webp'},
    'League of Legends': {prefix:'lol', icon:'assets/lol-logo.webp'}
  };
  const slug = label => label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  function enhanceRank(formPrefix) {
    const select = document.getElementById(`${formPrefix}-rank`);
    const game = document.getElementById(`${formPrefix}-game`);
    if (!select || !game) return;
    const ribbon = document.createElement('div');
    ribbon.className = 'vxsk-rank-picker';
    ribbon.setAttribute('role','group');
    ribbon.setAttribute('aria-label','Choose your current competitive rank');
    select.insertAdjacentElement('afterend', ribbon);
    const hint = document.createElement('p');hint.className='vxsk-rank-hint';
    hint.textContent='Select a rank above or tap a badge. Badges are illustrations of the game rank tiers.';
    ribbon.insertAdjacentElement('afterend', hint);
    let lastGame = '';
    function paint() {
      const selectedGame = games[game.value] ? game.value : 'Rocket League';
      const config = games[selectedGame];
      if (lastGame !== selectedGame) {
        lastGame = selectedGame;
        ribbon.replaceChildren();
        for (const rank of rankLists[selectedGame]) {
          const button = document.createElement('button');
          button.type = 'button';button.className = 'vxsk-rank-choice';
          button.dataset.rank = rank;
          button.setAttribute('aria-label',`Select ${rank} rank`);
          const img = document.createElement('img');
          img.src = rank === 'Unranked' ? config.icon : (selectedGame === 'VALORANT' && rank === 'Ascendant' ? 'assets/rank-badges/val-ascendant.svg' : `assets/rank-badges/${config.prefix}-${slug(rank)}.webp`);
          img.loading='lazy';img.decoding='async';img.alt='';img.width=60;img.height=60;
          const caption = document.createElement('span');caption.textContent=rank;
          button.append(img,caption);
          button.addEventListener('click',() => {
            select.value=rank;
            select.dispatchEvent(new Event('change',{bubbles:true}));
          });
          ribbon.append(button);
        }
      }
      for (const button of ribbon.children) button.setAttribute('aria-pressed',String(button.dataset.rank===select.value));
    }
    game.addEventListener('change', () => queueMicrotask(paint));
    select.addEventListener('change',paint);
    const form=select.closest('form');
    form?.addEventListener('reset',() => {lastGame='';setTimeout(paint,0);});
    paint();
  }
  enhanceRank('form');
  enhanceRank('rival');

  // Inline, accessible partner social icons; actual href targets remain unchanged.
  const brandSvg = {
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle class="filled" cx="17.5" cy="6.5" r="1.1"/>',
    tiktok: '<path d="M14 3v11a4 4 0 1 1-3.5-4v3.1A1.2 1.2 0 1 0 11 14V3h3c.5 3 2.4 4.8 6 5v3c-2.7 0-4.6-.9-6-2.7"/>',
    facebook: '<path class="filled" d="M13.7 21V13h2.7l.4-3.2h-3.1v-2c0-.9.3-1.5 1.6-1.5H17V3.4c-.3 0-1.2-.2-2.4-.2-2.5 0-4.2 1.5-4.2 4.3v2.3H7.6V13h2.8v8h3.3Z"/>',
    website: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-4 4.5-4 13.5 0 18m0-18c4 4.5 4 13.5 0 18"/>',
    linktree: '<path d="M12 3v18m-6-8 6-7 6 7m-11 0 5-5 5 5m-13 1h16"/>',
    x: '<path d="M4 3h4.1L20 21h-4.2L4 3Zm16 0L4 21"/>'
  };
  const keys = ['instagram','tiktok','facebook','website','linktree','x'];
  document.querySelectorAll('.n2xt-socials a').forEach((link, i) => {
    const icon = document.createElement('span');icon.className='n2xt-social-logo';
    icon.setAttribute('aria-hidden','true');
    icon.innerHTML = svg(brandSvg[keys[i]] || brandSvg.website,17);
    link.prepend(icon);
  });
})();
