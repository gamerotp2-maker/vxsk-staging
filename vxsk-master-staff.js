'use strict';
/* VXSK staff UX organizer only. Existing RPC and AAL2 gate remain authoritative. */
(() => {
 const run=()=>{
  const $=id=>document.getElementById(id);
  const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  // The No Opponent feature is retired from navigation; old database records aren't deleted.
  $('staff-inbox-opponents')?.setAttribute('hidden','');
  $('staff-view-opponents')?.setAttribute('hidden','');
  const oldTab=document.querySelector('[data-staff-tab="opponents"]');if(oldTab)oldTab.hidden=true;
  const editor=$('content-editor');const kind=$('post-kind');
  if(editor && kind && !$('vxsk-master-editor-tabs')){
    const panel=make('div','vxsk-master-editor-tabs');panel.id='vxsk-master-editor-tabs';panel.setAttribute('role','group');panel.setAttribute('aria-label','Website post category');
    const updates=make('button','vxsk-master-editor-tab','📣 WEBSITE UPDATES');
    const matches=make('button','vxsk-master-editor-tab','⚔ WHO VS WHO');
    [updates,matches].forEach(b=>{b.type='button';panel.append(b);});
    function choose(v){
      const option=[...kind.options].find(x=>x.value===v);
      if(!option)return;
      kind.value=v;kind.dispatchEvent(new Event('change',{bubbles:true}));
      updates.setAttribute('aria-pressed',String(v==='announcement'));matches.setAttribute('aria-pressed',String(v==='match'));
    }
    updates.addEventListener('click',()=>choose('announcement'));
    matches.addEventListener('click',()=>choose('match'));
    kind.addEventListener('change',()=>{updates.setAttribute('aria-pressed',String(kind.value==='announcement'));matches.setAttribute('aria-pressed',String(kind.value==='match'));});
    editor.insertBefore(panel,editor.firstChild);
    updates.setAttribute('aria-pressed',String(kind.value==='announcement'));
    matches.setAttribute('aria-pressed',String(kind.value==='match'));
    const heading=$('content-title');if(heading)heading.textContent='WEBSITE UPDATES & WHO VS WHO';
  }
  // Staff applications require owner-authenticated backend intake; don't fake approvals.
  const team=$('staff-view-team');
  if(team && !$('vxsk-master-staff-apps')){
    const section=make('section','vxsk-master-staff-apps');section.id='vxsk-master-staff-apps';
    section.append(make('h3','','STAFF APPLICATIONS · PENDING SECURE BACKEND'),
      make('p','','Planned: players apply, owner reviews, then the existing owner-only role RPC grants access. No one becomes staff merely by submitting a form. Staff portraits need member consent and approved media storage.'));
    team.append(section);
  }
  // Explain event/fixture separation: a calendar event is not a scoreable bracket match.
  const eventForm=$('staff-event-form');
  if(eventForm && !$('vxsk-master-event-help')){
    const note=make('p','vxsk-master-event-help','IMPORTANT: Saving an event creates a calendar event, not a bracket match. To make it selectable for referee scores, also create and publish a matching bracket match below. Match modes and result deletion need validated backend support.');
    note.id='vxsk-master-event-help';eventForm.prepend(note);
  }
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
