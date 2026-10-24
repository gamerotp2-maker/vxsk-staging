
/* VXSK AI V12.9 — Private Mock Pilot (frontend access correction)
   Owner + Owner-approved staff testers; MFA AAL2 required.
   Server RPC enforces pilot approval and quotas. No OpenAI billing.
*/
'use strict';

(() => {
  const START_DELAY = 8_000;
  let lastMessageAt = 0;
  let mounted = false;
  let activeUserId = null;
  let accessEpoch = 0;

  function permittedStaffRole(role) {
    return ['owner', 'reviewer', 'staff'].includes(role);
  }

  function unmountUI() {
    document.getElementById('vxsk-ai-button')?.remove();
    document.getElementById('vxsk-ai-panel')?.remove();
    mounted = false;
    lastMessageAt = 0;
  }

  const style = document.createElement('style');
  style.textContent = `
    #vxsk-ai-button {
      position: fixed;
      right: 22px;
      bottom: 22px;
      width: 64px;
      height: 64px;
      border: 1px solid #a875ff;
      border-radius: 50%;
      background: linear-gradient(135deg,#762cff,#006aff);
      color: white;
      font-size: 28px;
      cursor: pointer;
      z-index: 9998;
      box-shadow: 0 8px 32px #723cff65;
    }

    #vxsk-ai-panel {
      position: fixed;
      right: 20px;
      bottom: 100px;
      width: min(380px, calc(100vw - 24px));
      height: min(530px, calc(100dvh - 125px));
      display: flex;
      flex-direction: column;
      background: #10132d;
      border: 1px solid #7358c4;
      border-radius: 18px;
      color: white;
      z-index: 9999;
      box-shadow: 0 16px 50px #0009;
      overflow: hidden;
      font-family: Arial, sans-serif;
    }

    #vxsk-ai-panel[hidden],
    #vxsk-ai-button[hidden] {
      display: none !important;
    }

    .vxsk-ai-head {
      padding: 16px;
      background: linear-gradient(120deg,#442099,#1346aa);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .vxsk-ai-head strong {
      font-size: 17px;
    }

    #vxsk-ai-close {
      border: 0;
      background: transparent;
      color: white;
      font-size: 23px;
      cursor: pointer;
    }

    #vxsk-ai-messages {
      flex: 1;
      overflow-y: auto;
      padding: 15px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .vxsk-ai-message {
      max-width: 90%;
      padding: 11px 13px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .vxsk-ai-message.bot {
      background: #22264b;
      align-self: flex-start;
    }

    .vxsk-ai-message.user {
      background: #5f35bf;
      align-self: flex-end;
    }

    #vxsk-ai-form {
      display: flex;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid #35365b;
    }

    #vxsk-ai-input {
      flex: 1;
      min-width: 0;
      border: 1px solid #53567a;
      background: #171a38;
      border-radius: 9px;
      padding: 10px;
      color: white;
      font-size: 14px;
    }

    #vxsk-ai-send {
      background: #783eff;
      color: white;
      border: 0;
      border-radius: 9px;
      padding: 10px 14px;
      cursor: pointer;
    }

    #vxsk-ai-status {
      padding: 0 12px 10px;
      color: #c6bee2;
      font-size: 11px;
    }

    @media (max-width: 500px) {
      #vxsk-ai-button {
        right: 12px;
        bottom: 12px;
      }

      #vxsk-ai-panel {
        right: 12px;
        bottom: 88px;
        width: calc(100vw - 24px);
      }
    }
  `;
  document.head.appendChild(style);

  function createMessage(container, message, type) {
    const bubble = document.createElement('div');
    bubble.className = 'vxsk-ai-message ' + type;
    bubble.textContent = message;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  function mountUI(api) {
    
if (mounted) {
  const button = document.getElementById('vxsk-ai-button');
  if (button) button.hidden = false;
  return;
}

    mounted = true;

    const button = document.createElement('button');
    button.id = 'vxsk-ai-button';
    button.type = 'button';
    button.textContent = '🤖';
    button.setAttribute('aria-label', 'Open VXSK AI');

    const panel = document.createElement('section');
    panel.id = 'vxsk-ai-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'VXSK AI Assistant');

    panel.innerHTML = `
      <div class="vxsk-ai-head">
        <strong>🤖 VXSK AI · TEST</strong>
        <button type="button" id="vxsk-ai-close" aria-label="Close AI chat">×</button>
      </div>

      <div id="vxsk-ai-messages" role="log" aria-live="polite"></div>

      <form id="vxsk-ai-form">
        <input id="vxsk-ai-input"
               placeholder="Ask VXSK AI..."
               maxlength="1000"
               aria-label="Your message"
               required>
        <button type="submit" id="vxsk-ai-send">SEND</button>
      </form>

      <div id="vxsk-ai-status" role="status">
        Private pilot · Supabase mock replies · No OpenAI billing
      </div>
    `;

    document.body.append(button, panel);

    const messages = panel.querySelector('#vxsk-ai-messages');
    const input = panel.querySelector('#vxsk-ai-input');
    const status = panel.querySelector('#vxsk-ai-status');

    createMessage(
      messages,
      'Hey! 👋 Need help finding a match, checking tournaments, or managing your account?',
      'bot'
    );

    button.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) input.focus();
    });

    panel.querySelector('#vxsk-ai-close').addEventListener('click', () => {
      panel.hidden = true;
      button.focus();
    });

    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        panel.hidden = true;
        button.focus();
      }
    });

    panel.querySelector('#vxsk-ai-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const send = panel.querySelector('#vxsk-ai-send');
      if (send.disabled) return;
      send.disabled = true;
      const requestEpoch = accessEpoch;

      try {
        // Every request rechecks the signed-in account and MFA status.
        const { data: userData, error: userError } = await api.auth.getUser();
        if (requestEpoch !== accessEpoch) return;
        if (userError || !userData?.user || userData.user.id !== activeUserId) {
          unmountUI();
          activeUserId = null;
          return;
        }

        const { data: roleData, error: roleError } = await api
          .from('staff_roles')
          .select('role')
          .eq('user_id', userData.user.id)
          .maybeSingle();

        const { data: assurance, error: mfaError } =
          await api.auth.mfa.getAuthenticatorAssuranceLevel();

        if (requestEpoch !== accessEpoch) return;
        if (roleError || mfaError ||
            !permittedStaffRole(roleData?.role) ||
            assurance?.currentLevel !== 'aal2') {
          unmountUI();
          activeUserId = null;
          return;
        }

        const question = input.value.trim();
        if (!question) return;

        if (Date.now() - lastMessageAt < START_DELAY) {
          status.textContent = 'Please wait 8 seconds between successful messages.';
          return;
        }

        createMessage(messages, question, 'user');
        input.value = '';
        status.textContent = 'Checking pilot access...';

        // Membership/pilot_allowed, quotas and MFA are enforced in Supabase,
        // not by trusting frontend role checks.
        const { data, error } = await api.rpc('vxsk_ai_mock_message', {
          p_message: question
        });

        if (requestEpoch !== accessEpoch) return;
        if (error) {
          createMessage(messages, 'Mock AI request denied: ' + error.message, 'bot');
          status.textContent = 'No message quota charged by this frontend';
          return;
        }

        if (!data || typeof data.reply !== 'string') {
          status.textContent = 'Unexpected mock response; check staging logs.';
          return;
        }

        lastMessageAt = Date.now(); // Do not apply local cooldown on failed calls.
        createMessage(messages, data.reply, 'bot');
        status.textContent =
          data.messages_remaining + '/' + data.daily_limit +
          ' messages remaining · ' + String(data.plan || 'free').toUpperCase();
      } catch (error) {
        if (requestEpoch === accessEpoch) {
          status.textContent = 'Mock request failed; please retry later.';
          console.warn('VXSK AI mock request:', error);
        }
      } finally {
        if (requestEpoch === accessEpoch && panel.isConnected) send.disabled = false;
      }
    });
  }

  async function init() {
    const requestEpoch = ++accessEpoch;
    const api = window.VXSKAuth?.client;
    if (!api) {
      unmountUI();
      activeUserId = null;
      return;
    }

    try {
      const { data: userData, error: userError } =
        await api.auth.getUser();
      if (requestEpoch !== accessEpoch) return;
      if (userError || !userData?.user) {
        unmountUI();
        activeUserId = null;
        return;
      }

      const { data: roleData, error: roleError } = await api
        .from('staff_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      if (requestEpoch !== accessEpoch) return;
      if (roleError || !permittedStaffRole(roleData?.role)) {
        unmountUI();
        activeUserId = null;
        return;
      }

      const { data: assurance, error: mfaError } =
        await api.auth.mfa.getAuthenticatorAssuranceLevel();
      if (requestEpoch !== accessEpoch) return;
      if (mfaError || assurance?.currentLevel !== 'aal2') {
        unmountUI();
        activeUserId = null;
        return;
      }

      // Remove old chat content on account switch so users never share chats.
      if (activeUserId !== userData.user.id) {
        unmountUI();
        activeUserId = userData.user.id;
      }
      mountUI(api);
    } catch (error) {
      if (requestEpoch === accessEpoch) {
        unmountUI();
        activeUserId = null;
        console.warn('VXSK AI pilot unavailable:', error);
      }
    }
  }

  const authClient = window.VXSKAuth?.client;
  if (authClient) {
    authClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        ++accessEpoch; // invalidate any unfinished requests
        unmountUI();
        activeUserId = null;
        return;
      }
      if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) {
        if (activeUserId && session?.user?.id !== activeUserId) {
          ++accessEpoch;
          unmountUI();
          activeUserId = null;
        }
        // Avoid using the auth client synchronously inside the auth callback.
        setTimeout(init, 0);
      }
    });
  }

  init();
})();
