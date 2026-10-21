'use strict';
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const dialog = $('#register-dialog');
  const form = $('#vxsk-form');
  const gameSelect = $('#form-game');
  const modeSelect = $('#form-mode');
  const contactType = $('#form-contact-type');
  const contactInput = $('#form-contact');
  const context = $('#game-context');
  const teamFields = $('#team-fields');
  const mateOne = $('#form-mate-one');
  const mateTwo = $('#form-mate-two');
  const mateThreeWrap = $('#mate-three-wrap');
  const formMessage = $('#form-message');
  const submitButton = $('#submit-registration');
  const navLinks = $('#nav-links');
  const menuToggle = $('#menu-toggle');
  let lastTrigger = null;

  // All display strings are defined here, not interpolated from a player's submission.
  const phaseNames = new Set(['1v1', '2v2', '3v3', 'Freestyle']);
  const setFormContext = () => {
    const rocketLeague = gameSelect.value === 'Rocket League';
    $$('#form-mode option').forEach(option => {
      option.disabled = rocketLeague ? option.value === 'Interest list' : option.value !== 'Interest list';
    });
    if (rocketLeague && !phaseNames.has(modeSelect.value)) modeSelect.value = '1v1';
    if (!rocketLeague) modeSelect.value = 'Interest list';
    const teamMode = rocketLeague && ['2v2', '3v3'].includes(modeSelect.value);
    teamFields.hidden = !teamMode;
    mateOne.required = teamMode;
    const isTrio = teamMode && modeSelect.value === '3v3';
    mateThreeWrap.hidden = !isTrio;
    mateTwo.required = isTrio;
    if (!teamMode) {
      $('#form-team').value = '';
      mateOne.value = '';
      mateTwo.value = '';
    } else if (!isTrio) {
      mateTwo.value = '';
    }
    context.textContent = rocketLeague
      ? `Rocket League · ${modeSelect.value}. This is a player application, not a guaranteed event spot.`
      : `${gameSelect.value} · planned VXSK calendar. You're joining an interest list; full mode registration is not open yet.`;
  };
  const setContactInput = () => {
    const cfg = {
      'Discord': ['Your Discord username', 'text', 'off'],
      'Email': ['you@example.com', 'email', 'email'],
      'Phone': ['Your phone number (include country code)', 'tel', 'tel'],
      'In-game': ['Your in-game username', 'text', 'nickname']
    }[contactType.value];
    contactInput.placeholder = cfg[0];
    contactInput.type = cfg[1];
    contactInput.autocomplete = cfg[2];
    contactInput.value = '';
  };
  const getVXSKClient = () => window.VXSKAuth?.client || null;
  const requireVXSKAccount = async () => {
    const api = getVXSKClient();
    if (!api) return {error: 'Account service is not configured yet.'};
    const {data:{user},error} = await api.auth.getUser();
    if (error || !user) return {error:'Sign in to your VXSK account first. Create an account if needed.',signedOut:true};
    if (!user.email_confirmed_at && !user.confirmed_at) return {error:'Verify your account email before registering.'};
    return {api,user};
  };
  const openRegistration = async (game = 'Rocket League', mode = '1v1', trigger = null) => {
    const access = await requireVXSKAccount();
    if (access.error) {
      if (access.signedOut) {
        document.querySelector('.open-account')?.click();
        const accountStatus=document.querySelector('#account-status');
        if(accountStatus) {accountStatus.textContent='Sign in first to enter a VXSK event.';accountStatus.className='account-status';}
      } else alert(access.error);
      return;
    }
    lastTrigger = trigger;
    formMessage.textContent = '';
    formMessage.className = 'form-message';
    gameSelect.value = ['Rocket League', 'VALORANT', 'League of Legends'].includes(game) ? game : 'Rocket League';
    modeSelect.value = phaseNames.has(mode) || mode === 'Interest list' ? mode : '1v1';
    setFormContext();
    if(window.VXSKFillRank) { window.VXSKFillRank(gameSelect.value, document.querySelector('#form-rank')); document.querySelector('#form-rank').value='Unranked'; }
    context.textContent += ' Registered account email: '+(access.user.email||'');
    dialog.showModal();
    $('#form-player').focus();
  };
  window.VXSKOpenRegistration = openRegistration;
  $$('.open-register').forEach(button => button.addEventListener('click', () => openRegistration(button.dataset.game, button.dataset.mode, button)));
  $('#close-modal').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => lastTrigger?.focus());
  gameSelect.addEventListener('change', () => {setFormContext(); if(window.VXSKFillRank) { window.VXSKFillRank(gameSelect.value, document.querySelector('#form-rank')); document.querySelector('#form-rank').value='Unranked'; }});
  modeSelect.addEventListener('change', setFormContext);
  contactType.addEventListener('change', setContactInput);
  setFormContext();

  const isLocalPreview = location.protocol === 'file:' || ['localhost', '127.0.0.1', '0.0.0.0'].includes(location.hostname);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    formMessage.className = 'form-message';
    if (form.elements['vxsk-trap'].value.trim()) return;
    const access = await requireVXSKAccount();
    if (access.error) {
      formMessage.className='form-message error';
      formMessage.textContent=access.error;
      return;
    }
    submitButton.disabled = true;
    formMessage.textContent = 'Submitting your signed-in VXSK application…';
    try {
      const fields = Object.fromEntries(new FormData(form).entries());
      delete fields['vxsk-trap'];
      delete fields['form-name'];
      // Uses the Supabase JWT of the signed-in user. The server ignores any
      // player-provided account ID or email and checks auth.users itself.
      const {data,error}=await access.api.rpc('submit_registration',{p_fields:fields});
      if (error) throw error;
      if (!data) throw new Error('Registration was not confirmed');
      formMessage.className='form-message success';
      formMessage.textContent='✓ APPLICATION RECEIVED! Staff will review it. Check Account → My Applications for Pending, Approved or Rejected status (use Refresh). Automated decision emails are currently paused. Applying does not guarantee a place.';
      form.reset(); gameSelect.value='Rocket League';modeSelect.value='1v1';setFormContext();setContactInput();
      window.dispatchEvent(new Event('vxsk:application-submitted'));
    } catch(error) {
      formMessage.className='form-message error';
      const m=String(error?.message||'');
      if (/rate limit|too many/i.test(m)) formMessage.textContent='Too many applications. Please wait before submitting again.';
      else if (/login|authenticated|jwt|session|email.*confirm/i.test(m)) formMessage.textContent='Sign in and verify your email before registering.';
      else if (/invalid|unsupported|required|consent/i.test(m)) formMessage.textContent='Check the fields and try again.';
      else formMessage.textContent='Unable to submit. Contact VXSK staff; application was NOT confirmed.';
      console.warn('[VXSK application] Supabase registration request failed (no private data logged).');
    } finally { submitButton.disabled=false; }
  });

  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    navLinks.classList.toggle('open', open);
  });
  $$('.nav-links a').forEach(link => link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
  }));

  // Use the user's calendar dates, interpreted at the start/end of each listed day.
  const today = new Date();
  const dateKey = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const keyOf = raw => Number(raw.replaceAll('-', ''));
  $$('.mode-card').forEach(card => {
    const state = $('[data-phase-state]', card);
    if (dateKey >= keyOf(card.dataset.start) && dateKey <= keyOf(card.dataset.end)) {
      state.textContent = '● LIVE PHASE';
      state.classList.add('live');
    } else if (dateKey > keyOf(card.dataset.end)) {
      state.textContent = 'PHASE COMPLETE';
      state.classList.add('ended');
    } else state.textContent = 'UP NEXT';
  });
  $('#copyright-year').textContent = String(Math.max(2026, new Date().getFullYear()));

  // Display the VXSK artwork if a visitor blocks YouTube's image host.
  $$('.video-thumbnail img').forEach(image => {
    image.addEventListener('error', () => {
      if (image.dataset.fallback !== 'true') {
        image.dataset.fallback = 'true';
        image.src = 'assets/vxsk-announcement.webp';
      }
    });
  });

})();
