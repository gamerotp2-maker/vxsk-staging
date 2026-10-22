'use strict';
/* V12.8.22: MFA-verified reviewer queue. Editors alone can publish. */
(()=>{
  const $=id=>document.getElementById(id);
  const list=$('staff-challenges-list');if(!list)return;
  const message=$('staff-challenges-notice');
  let api=null,viewer=false,editor=false,busy=false;
  function t(tag,value,cls=''){const n=document.createElement(tag);n.textContent=String(value||'');if(cls)n.className=cls;return n;}
  function say(s){message.textContent=s;}
  async function load(){
    if(!api||!viewer||busy)return;
    busy=true;list.replaceChildren(t('p','Loading player-approved challenges…'));
    try{
      const {data,error}=await api.rpc('vxsk_showmatch_staff_queue');
      if(error)throw error;
      list.replaceChildren();
      if(!data?.length){list.append(t('p','No accepted showmatch challenges yet. Players can challenge accepted friends from Community.'));return;}
      for(const c of data){
        const card=t('article','','staff-arena-item');
        const a=c.challenger_name||'Player A',b=c.opponent_name||'Player B';
        card.append(t('strong',a+' vs '+b),t('small',c.game+' · '+c.mode+' · '+c.state.toUpperCase()));
        if(editor){
          const actions=t('div','','staff-arena-actions');
          const fill=t('button','USE IN SHOWMATCH EDITOR');fill.type='button';
          fill.addEventListener('click',()=>{
            const form=$('post-form');if(!form||$('content-editor').hidden){say('Showmatch editor is not available to this account.');return;}
            $('post-reset')?.click(); // Never overwrite an unrelated match being edited.
            $('post-kind').value='match';$('post-kind').dispatchEvent(new Event('change'));
            $('post-title').value=c.game+' · '+c.mode+' SHOWMATCH';
            $('post-game').value=c.game;$('post-mode').value=c.mode;
            $('post-player-a').value=a;$('post-player-b').value=b;
            $('post-published').checked=false;
            $('post-status').value='scheduled';
            $('post-starts').focus();form.scrollIntoView({block:'start',behavior:'smooth'});
            say('Challenge copied into a PRIVATE DRAFT. Set the teams, date and stream, save, then publish when agreed.');
          });actions.append(fill);
          if(c.state==='accepted'||c.state==='scheduled'){
            const action=c.state==='accepted'?'scheduled':'completed';
            const mark=t('button',c.state==='accepted'?'MARK SCHEDULED':'MARK COMPLETED');mark.type='button';
            mark.addEventListener('click',async()=>{
              if(!confirm('Update challenge to '+action+'? For SCHEDULED, publish the fixture separately after confirming details.'))return;
              mark.disabled=true;
              const {data:ok,error}=await api.rpc('vxsk_showmatch_staff_status',{p_challenge:c.id,p_state:action});
              if(error||!ok)say('Update refused. Check editor permissions and that the challenge is still open.');
              else{say('Challenge marked '+action+'.');await load();}
              mark.disabled=false;
            });actions.append(mark);
          }
          card.append(actions);
        }
        list.append(card);
      }
      say(editor?'Challenges loaded. Publishing remains a separate authorized step.':'Read-only reviewer view. Ask the Owner or authorized editor to publish.');
    }catch(e){list.replaceChildren(t('p','Challenge queue unavailable. Run V12.8.22 SQL in STAGING and verify MFA.'));say('Unable to load: '+String(e?.code||'database setup or permission error'));}
    finally{busy=false;}
  }
  $('staff-challenges-refresh')?.addEventListener('click',load);
  window.addEventListener('vxsk:staff-showmatches-open',()=>void load());
  window.addEventListener('vxsk:staff-ready',async()=>{
    api=window.VXSK_STAFF_API;if(!api)return;
    const {data:level}=await api.auth.mfa.getAuthenticatorAssuranceLevel();
    if(level?.currentLevel!=='aal2'){say('Verified staff 2FA is required.');return;}
    const [ref,canEdit]=await Promise.all([api.rpc('vxsk_hub_referee'),api.rpc('can_edit_match_center')]);
    viewer=!ref.error&&ref.data===true;editor=!canEdit.error&&canEdit.data===true;
    if(!viewer){say('No referee/reviewer permission.');return;}
    if(!$('staff-view-bulletin').hidden)void load();
  });
})();
