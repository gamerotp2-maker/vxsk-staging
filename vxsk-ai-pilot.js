
/* VXSK AI V12.9 — Private Mock Pilot
   Owner + 2FA only.
   No real AI API, payments or database writes.
*/
'use strict';

(() => {
  const START_DELAY = 8_000;
  let lastMessageAt = 0;
  let mounted = false;

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

  function mockReply(question) {
    const text = question.toLowerCase();

    if (text.includes('hello') ||
        text.trim() === 'hi' ||
        text.includes('salem')) {
      return 'Hey! 👋 What's up?';
    }

    if (text.includes('rocket')) {
      return 'VXSK features Rocket League events and showmatches.';
    }

    if (text.includes('valorant')) {
      return 'VALORANT is one of the three VXSK games.';
    }

    if (text.includes('league') ||
        text.includes('lol')) {
      return 'League of Legends is part of the VXSK event.';
    }

    if (text.includes('tournament') ||
        text.includes('match')) {
      return 'You can check the Arena Hub for published events and matches. This demo cannot read live schedules yet.';
    }

    if (text.includes('friend')) {
      return 'Open Friends & Requests to manage your VXSK connections.';
    }

    return 'This is the VXSK AI test assistant. Real AI responses and live event knowledge will be enabled in a later phase.';
  }

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
        Owner preview · Mock AI · No real API calls
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

      // Recheck identity before allowing even demo interaction.
      const { data: userData, error: userError } = await api.auth.getUser();
      if (userError || !userData?.user) {
        panel.hidden = true;
        button.hidden = true;
        return;
      }

      const { data: roleData, error: roleError } = await api
        .from('staff_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .maybeSingle();

      const { data: assurance, error: mfaError } =
        await api.auth.mfa.getAuthenticatorAssuranceLevel();

      if (roleError || mfaError ||
          roleData?.role !== 'owner' ||
          assurance?.currentLevel !== 'aal2') {
        panel.hidden = true;
        button.hidden = true;
        return;
      }

      const now = Date.now();

      if (now - lastMessageAt < START_DELAY) {
        status.textContent = 'Please wait 8 seconds between messages.';
        return;
      }

      const question = input.value.trim();
      if (!question) return;

      lastMessageAt = now;
      createMessage(messages, question, 'user');
      input.value = '';

      createMessage(messages, mockReply(question), 'bot');
      status.textContent = 'Mock AI · No real AI usage or billing';
    });

    api.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        button.hidden = true;
        panel.hidden = true;
      }
    });
  }

  async function init() {
    const api = window.VXSKAuth?.client;
    if (!api) return;

    try {
      const { data: userData, error: userError } =
        await api.auth.getUser();

      if (userError || !userData?.user) return;

      const { data: roleData, error: roleError } = await api
        .from('staff_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .maybeSingle();

      if (roleError || roleData?.role !== 'owner') return;

      const { data: assurance, error: mfaError } =
        await api.auth.mfa.getAuthenticatorAssuranceLevel();

      if (mfaError || assurance?.currentLevel !== 'aal2') return;

      mountUI(api);
    } catch (error) {
      console.warn('VXSK AI pilot unavailable:', error);
    }
  }

 
  const authClient = window.VXSKAuth?.client;

  if (authClient) {
    authClient.auth.onAuthStateChange((event) => {
      if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) {
        setTimeout(() => init(), 0);
      }
    });
  }

  init();
})();

