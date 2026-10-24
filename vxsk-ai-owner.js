
/* VXSK AI V12.9 — Owner Manager UI
   Backend enforces Owner + 2FA.
   No payments or real AI.
*/
'use strict';

(() => {
  function init() {
    const host = document.getElementById('staff-view-team');
    const api = window.VXSK_STAFF_API;

    if (!host || !api || document.getElementById('vxsk-ai-owner')) return;

    const panel = document.createElement('section');
    panel.id = 'vxsk-ai-owner';

    panel.innerHTML = `
      <h3>🤖 VXSK AI MANAGER</h3>
      <p>PRIVATE PILOT · OWNER ONLY · MOCK AI</p>

      <div class="ai-owner-status" id="ai-owner-status">
        Loading AI settings...
      </div>

      <div class="ai-owner-buttons">
        <button type="button" data-ai-action="enable">
          🟢 ENABLE AI
        </button>
        <button type="button" data-ai-action="disable">
          🔴 EMERGENCY OFF
        </button>
        <button type="button" id="ai-owner-refresh">
          ↻ REFRESH
        </button>
      </div>

      <h4>APPROVED TESTERS</h4>
      <div id="ai-owner-testers">Loading...</div>

      <h4>FIND STAFF TESTER</h4>
      <form id="ai-owner-search-form">
        <input id="ai-owner-search"
               placeholder="Search staff nickname"
               minlength="2" maxlength="40" required>
        <button type="submit">SEARCH</button>
      </form>

      <div id="ai-owner-search-results"></div>

      <p id="ai-owner-selected">
        Select a staff account first.
      </p>

      <div class="ai-owner-buttons">
        <button type="button" data-ai-action="allow_tester">
          APPROVE TESTER
        </button>
        <button type="button" data-ai-action="revoke_tester">
          REVOKE TESTER
        </button>
        <button type="button" data-ai-action="grant_pro_7d">
          👑 PRO TEST · 7 DAYS
        </button>
        <button type="button" data-ai-action="cancel_pro">
          CANCEL PRO
        </button>
      </div>

      <p id="ai-owner-feedback" role="status"></p>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #vxsk-ai-owner {
        margin-top: 24px;
        padding: 20px;
        background: #10142e;
        border: 1px solid #8060d8;
        border-radius: 16px;
        color: white;
      }
      #vxsk-ai-owner h3 { color: #bd93ff; }
      #vxsk-ai-owner h4 { margin: 23px 0 10px; }
      #vxsk-ai-owner p { color: #c7c5e5; }
      .ai-owner-status {
        padding: 14px;
        background: #22264a;
        border-radius: 10px;
        white-space: pre-line;
      }
      .ai-owner-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        margin-top: 14px;
      }
      #vxsk-ai-owner button {
        padding: 11px 13px;
        background: #6233c3;
        color: white;
        border: 1px solid #9175db;
        border-radius: 9px;
        cursor: pointer;
      }
      #vxsk-ai-owner button:disabled {
        opacity: .5;
        cursor: wait;
      }
      #vxsk-ai-owner [data-ai-action="disable"] {
        background: #802442;
      }
      #ai-owner-search-form {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      #ai-owner-search {
        flex: 1;
        min-width: 150px;
        padding: 11px;
        color: white;
        background: #1b2041;
        border: 1px solid #67558e;
        border-radius: 9px;
      }
      #ai-owner-search-results,
      #ai-owner-testers {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }
      #ai-owner-selected {
        padding: 9px;
        font-weight: bold;
      }
    `;

    document.head.appendChild(style);
    host.appendChild(panel);

    const $ = selector => panel.querySelector(selector);
    const feedback = $('#ai-owner-feedback');
    let selected = null;

    async function rpc(name, params = {}) {
      const { data, error } = await api.rpc(name, params);
      if (error) throw error;
      return data;
    }

    function message(text) {
      feedback.textContent = text;
    }

    async function refresh() {
      try {
        const data = await rpc('vxsk_ai_owner_snapshot');

        $('#ai-owner-status').textContent =
          'AI: ' + (data.enabled ? '🟢 ON' : '🔴 OFF') +
          '\nPilot Only: ' + (data.pilot_only ? 'YES' : 'NO') +
          '\nFree: ' + data.free_limit + '/day' +
          '\nPro Test: ' + data.pro_limit + '/day' +
          '\nCooldown: ' + data.cooldown + ' seconds';

        const list = $('#ai-owner-testers');
        list.replaceChildren();

        if (!data.testers?.length) {
          list.textContent = 'No approved testers yet.';
          return;
        }

        data.testers.forEach(tester => {
          const item = document.createElement('div');
          item.className = 'ai-owner-status';
          item.textContent =
            (tester.nickname || 'Player') +
            ' · ' + tester.plan +
            (tester.pro_until
              ? ' · Expires: ' +
                new Date(tester.pro_until).toLocaleString()
              : '');
          list.appendChild(item);
        });
      } catch (error) {
        message('Cannot load AI settings: ' + error.message);
      }
    }

    $('#ai-owner-refresh').addEventListener('click', refresh);

    $('#ai-owner-search-form').addEventListener('submit', async event => {
      event.preventDefault();
      selected = null;

      const query = $('#ai-owner-search').value.trim();
      const list = $('#ai-owner-search-results');

      list.replaceChildren();
      $('#ai-owner-selected').textContent = 'Select a staff account.';

      try {
        const users = await rpc('vxsk_owner_staff_search', {
          p_query: query
        });

        const staff = (users || []).filter(user =>
          ['owner', 'reviewer', 'staff'].includes(user.current_role)
        );

        if (!staff.length) {
          list.textContent = 'No matching staff account.';
          return;
        }

        staff.forEach(user => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent =
            user.nickname + ' · ' + user.current_role;

          button.addEventListener('click', () => {
            selected = user;
            $('#ai-owner-selected').textContent =
              'Selected: ' + user.nickname +
              ' (' + user.current_role + ')';
          });

          list.appendChild(button);
        });
      } catch (error) {
        message('Search failed: ' + error.message);
      }
    });

    panel.querySelectorAll('[data-ai-action]').forEach(button => {
      button.addEventListener('click', async () => {
        const action = button.dataset.aiAction;
        const globalAction = action === 'enable' || action === 'disable';

        if (!globalAction && !selected) {
          message('Select a staff tester first.');
          return;
        }

        if (action === 'enable' &&
            !confirm('Enable VXSK Mock AI for approved pilot users?')) {
          return;
        }

        if (action === 'revoke_tester' &&
            !confirm('Revoke access for ' + selected.nickname + '?')) {
          return;
        }

        if (action === 'grant_pro_7d' &&
            !confirm('Grant 7-day simulated Pro Test access?')) {
          return;
        }

        button.disabled = true;
        message('Processing...');

        try {
          await rpc('vxsk_ai_owner_control', {
            p_action: action,
            p_target_user_id: globalAction ? null : selected.user_id
          });

          message('✅ Action completed: ' + action);
          await refresh();
        } catch (error) {
          message('❌ ' + error.message);
        } finally {
          button.disabled = false;
        }
      });
    });

    refresh();
  }

  window.addEventListener('vxsk:staff-ready', event => {
    if (event.detail?.role === 'owner') init();
  });
})();
