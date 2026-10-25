'use strict';
/* VXSK rank-arrow bridge, V12.9.1.1. Cosmetic UI synchronization only.
   No credentials, authorization, registration submissions or database access. */
(() => {
  const tiers = {
    'Rocket League': ['Unranked', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Champion', 'Grand Champion', 'Supersonic Legend'],
    'VALORANT': ['Unranked', 'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'],
    'League of Legends': ['Unranked', 'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Challenger']
  };
  const images = {
    'Rocket League': {prefix: 'rl', icon: 'assets/rl-logo.webp'},
    'VALORANT': {prefix: 'val', icon: 'assets/valorant-logo.webp'},
    'League of Legends': {prefix: 'lol', icon: 'assets/lol-logo.webp'}
  };
  const owns = (key) => Object.prototype.hasOwnProperty.call(tiers, key);
  const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const gameSelect = document.getElementById('form-game');
  const rankSelect = document.getElementById('form-rank');
  const dialog = document.getElementById('register-dialog');
  if (!gameSelect || !rankSelect || !dialog) return;

  function updateRanks(resetRank = false) {
    const game = gameSelect.value;
    if (!owns(game)) return;
    const names = tiers[game];
    const current = Array.from(rankSelect.options, item => item.value);
    const optionsChanged = current.length !== names.length || current.some((v, i) => v !== names[i]);
    if (optionsChanged) {
      const prev = rankSelect.value;
      rankSelect.replaceChildren(...names.map(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        return option;
      }));
      rankSelect.value = !resetRank && names.includes(prev) ? prev : 'Unranked';
    } else if (resetRank) {
      rankSelect.value = 'Unranked';
    }

    // Badge gallery is separate from the native <select>. Never depend on a
    // change event or another script's cached lastGame value to correct it.
    let gallery = rankSelect.nextElementSibling;
    if (!gallery || !gallery.classList.contains('vxsk-rank-picker')) {
      gallery = document.createElement('div');
      gallery.className = 'vxsk-rank-picker';
      gallery.setAttribute('role', 'group');
      gallery.setAttribute('aria-label', 'Choose your current competitive rank');
      rankSelect.insertAdjacentElement('afterend', gallery);
    }
    const rankLabels = Array.from(gallery.children, item => item.dataset.rank);
    const needsRedraw = gallery.dataset.vxskRenderedGame !== game ||
      rankLabels.length !== names.length || rankLabels.some((v, i) => v !== names[i]);
    if (needsRedraw) {
      const config = images[game];
      const buttons = names.map(name => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'vxsk-rank-choice';
        button.dataset.rank = name;
        button.setAttribute('aria-label', `Select ${name} rank`);
        const icon = document.createElement('img');
        icon.src = name === 'Unranked' ? config.icon :
          game === 'VALORANT' && name === 'Ascendant' ? 'assets/rank-badges/val-ascendant.svg' :
          `assets/rank-badges/${config.prefix}-${slug(name)}.webp`;
        icon.alt = '';
        icon.loading = 'lazy';
        icon.decoding = 'async';
        icon.width = 60;
        icon.height = 60;
        const text = document.createElement('span');
        text.textContent = name;
        button.append(icon, text);
        button.addEventListener('click', () => {
          rankSelect.value = name;
          rankSelect.dispatchEvent(new Event('change', {bubbles: true}));
        });
        return button;
      });
      gallery.replaceChildren(...buttons);
      gallery.dataset.vxskRenderedGame = game;
    }
    for (const button of gallery.children) {
      button.setAttribute('aria-pressed', String(button.dataset.rank === rankSelect.value));
    }
  }

  // Capture arrow intent BEFORE app.js awaits authentication and opens modal.
  // Directly set form-game to the arrow's data-game and refresh its gallery.
  document.addEventListener('click', (event) => {
    const arrow = event.target.closest?.('.open-register[data-game]');
    const requested = arrow?.dataset.game;
    if (!owns(requested)) return;
    if (gameSelect.value !== requested) {
      gameSelect.value = requested;
      gameSelect.dispatchEvent(new Event('change', {bubbles: true}));
    }
    updateRanks(true);
  }, true);

  // Covers manual SELECT GAME changes (plus keyboard changes).
  gameSelect.addEventListener('change', () => queueMicrotask(() => updateRanks(true)));
  gameSelect.addEventListener('input', () => queueMicrotask(() => updateRanks(true)));
  rankSelect.addEventListener('change', () => queueMicrotask(() => updateRanks(false)));

  // The opening dialog may update form-game programmatically after async auth.
  // Reconcile immediately and on the next paints, avoiding a Rocket League flash.
  const onOpen = () => {
    if (!dialog.open) return;
    updateRanks(false);
    requestAnimationFrame(() => updateRanks(false));
    setTimeout(() => { if (dialog.open) updateRanks(false); }, 80);
  };
  new MutationObserver(onOpen).observe(dialog, {attributes: true, attributeFilter: ['open']});
  dialog.addEventListener('close', () => updateRanks(false));
  updateRanks(false);
})();
