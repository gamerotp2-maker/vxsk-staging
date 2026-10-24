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

  // Each game has its own backend-approved mode allowlist.
  // The SQL migration is required before non-Rocket League applications work.
  const modes={
    'Rocket League':['1v1','2v2','3v3','Freestyle'],
    'League of Legends':['1v1 ARAM','5v5 ARAM',"5v5 Summoner's Rift",'Mundo Showmatch'],
    'VALORANT':['1v1 Skirmish','5v5 Showmatch','2v2 Skirmish','Deathmatch']
  };
  const mateFour=$('#form-mate-four'),mateFive=$('#form-mate-five');
  const setFormContext = (preferredMode = null) => {
    const available=modes[gameSelect.value]||modes['Rocket League'];
    $$('#form-mode option').forEach(option => {option.disabled=!available.includes(option.value);});
    $$('#form-mode optgroup').forEach(group=>{group.hidden=group.label.indexOf(gameSelect.value.toUpperCase())===-1;});
    const requested=preferredMode||modeSelect.value;
    if(!available.includes(requested))modeSelect.value=available[0];
    else modeSelect.value=requested;
    const teamSize = modeSelect.value.startsWith('5v5') ? 5 : modeSelect.value.startsWith('3v3') ? 3 :
      (modeSelect.value.startsWith('2v2') ? 2 : 1);
    teamFields.hidden = teamSize === 1;
    const mateFields=[mateOne,mateTwo,mateFour,mateFive];
    mateFields.forEach((field,i)=>{
      const active=i < teamSize-1;
      field.required=active;
      field.closest('.field').hidden=!active;
      if(!active)field.value='';
    });
    if(teamSize===1)$('#form-team').value='';
    context.textContent=gameSelect.value+' · '+modeSelect.value+' · '+
      (teamSize>1?('Captain + '+(teamSize-1)+' teammate names required. '):'Solo entry. ')+
      '2026–27 VXSK application. Subject to staff review; no place is guaranteed.';
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
  // VXSK P0: Sync rank immediately when the game selection changes.
  function syncRegistrationRank() {
    const select = document.querySelector('#form-rank');
    if (!select || typeof window.VXSKFillRank !== 'function') return;
    window.VXSKFillRank(gameSelect.value, select);
    select.value = 'Unranked';
  }
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
    setFormContext(mode);
    syncRegistrationRank();
    context.textContent += ' Registered account email: '+(access.user.email||'');
    dialog.showModal();
    $('#form-player').focus();
  };
  window.VXSKOpenRegistration = openRegistration;
  $$('.open-register').forEach(button => button.addEventListener('click', () => openRegistration(button.dataset.game, button.dataset.mode, button)));
  $('#close-modal').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => lastTrigger?.focus());
  gameSelect.addEventListener('change', () => { setFormContext(); syncRegistrationRank(); });
  gameSelect.addEventListener('input', () => { setFormContext(); syncRegistrationRank(); });
  modeSelect.addEventListener('change', () => setFormContext());
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
    if(gameSelect.value !== 'Rocket League'){
      const version=await access.api.rpc('vxsk_registration_mode_version');
      if(version.error || version.data !== '12.8.8'){
        formMessage.className='form-message error';
        formMessage.textContent='This game’s mode applications are not activated in STAGING. Run V12.8.8 Registration SQL first. Nothing was sent.';
        submitButton.disabled=false;
        return;
      }
    }
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
