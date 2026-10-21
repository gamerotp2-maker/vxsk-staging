(() => {
 'use strict';
 const rankTiers = {"Rocket League": ["Unranked", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Champion", "Grand Champion", "Supersonic Legend"], "VALORANT": ["Unranked", "Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal", "Radiant"], "League of Legends": ["Unranked", "Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Master", "Grandmaster", "Challenger"]};
 const id = s => document.getElementById(s);
 function fillRank(game, select) {
   if (!select) return;
   const tiers = rankTiers[game] || rankTiers['Rocket League'];
   const previous = select.value;
   select.replaceChildren(...tiers.map(t => { const o=document.createElement('option');o.value=t;o.textContent=t;return o;}));
   if (tiers.includes(previous)) select.value=previous;
 }
 window.VXSKFillRank=fillRank;
 fillRank(id('form-game')?.value, id('form-rank'));
 fillRank(id('rival-game')?.value,id('rival-rank'));
 id('rival-game')?.addEventListener('change', () => {
   const game=id('rival-game').value;fillRank(game,id('rival-rank'));
   const select=id('rival-mode');
   const options = game==='Rocket League' ? ['1v1','2v2','3v3','Freestyle'] : game==='VALORANT' ? ['1v1','2v2','5v5'] : ['1v1','2v2','5v5'];
   select.replaceChildren(...options.map(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;return o;}));
 });
 const rankButtons=[...document.querySelectorAll('[data-rank-tab]')];
 function chooseRank(slug){
  rankButtons.forEach(b=>{const yes=b.dataset.rankTab===slug;b.classList.toggle('is-active',yes);b.setAttribute('aria-pressed', String(yes));});
  document.querySelectorAll('[data-rank-game]').forEach(el=>el.hidden=el.dataset.rankGame!==slug);
 }
 rankButtons.forEach(b=>b.addEventListener('click',()=>chooseRank(b.dataset.rankTab)));chooseRank('rl');
 // Game-universe cards open the corresponding season chapters.
 const byGame={'Rocket League':'rocket','VALORANT':'valorant','League of Legends':'lol'};
 document.querySelectorAll('[data-game-card]').forEach(card => {
   card.addEventListener('click', event => {
     if (event.target.closest('a,button')) return;
     const key=byGame[card.dataset.gameCard] || 'rocket';
     window.VXSKSelectSeason?.(key);
     document.getElementById('modes')?.scrollIntoView({behavior:'smooth',block:'start'});
   });
 });
 const list=id('match-list');
 const matches=Array.isArray(window.VXSK_MATCHES)?window.VXSK_MATCHES:[];
 if(list && matches.length){
   list.replaceChildren();
   for(const m of matches.slice(0,48)){
     if(!m || !['Rocket League','VALORANT','League of Legends'].includes(m.game) || !m.playerA || !m.playerB || !m.time)continue;
     const parsed=new Date(m.time);if(Number.isNaN(parsed.getTime()))continue;
     const card=document.createElement('article');card.className='match-card';
     const tag=document.createElement('span');tag.className='match-kicker';tag.textContent=m.game+' / '+(m.mode||'Showmatch');
     const names=document.createElement('div');names.className='match-names';
     const a=document.createElement('b');a.textContent=String(m.playerA).slice(0,48);
     const versus=document.createElement('span');versus.textContent='VS';
     const b=document.createElement('b');b.textContent=String(m.playerB).slice(0,48);
     names.append(a,versus,b);
     const date=document.createElement('time');date.dateTime=m.time;date.textContent=parsed.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Africa/Tunis'})+' (Tunis time)';
     const status=document.createElement('p');status.className='match-status';status.textContent=(m.status||'Scheduled').toUpperCase();
     card.append(tag,names,date,status);list.append(card);
   }
 }
 // Opponent requests now use the authenticated Supabase inbox, NOT Netlify Forms.
 const form=id('rival-form'), status=id('rival-status'), submit=form?.querySelector('[type="submit"]');
 form?.addEventListener('submit',async e=>{
   e.preventDefault(); if(!form.reportValidity())return;
   if(form.elements['rival-trap'].value.trim())return;
   const api=window.VXSKAuth?.client;
   status.className='form-message';
   if(!api){status.className='form-message error';status.textContent='Sign-in service unavailable. Please try later.';return;}
   submit.disabled=true;status.textContent='Sending private opponent request to VXSK staff…';
   try{
     const {data:{user},error:authError}=await api.auth.getUser();
     if(authError||!user) throw new Error('Please sign in to your VXSK account before requesting an opponent.');
     if(!user.email_confirmed_at && !user.confirmed_at)throw new Error('Please confirm your account email first.');
     const fields=Object.fromEntries(new FormData(form).entries());
     delete fields['rival-trap'];delete fields['form-name'];
     const {data,error}=await api.rpc('submit_opponent_request',{p_fields:fields});
     if(error)throw error;
     if(!data)throw new Error('Request not confirmed by server');
     form.reset(); id('rival-game').dispatchEvent(new Event('change'));
     status.className='form-message success';
     status.textContent='✓ OPPONENT REQUEST RECEIVED BY VXSK STAFF. Track Pending / Reviewed / Matched in My Account → My No Opponent Requests.';
     window.dispatchEvent(new Event('vxsk:opponent-request-submitted'));
   } catch(error){
     status.className='form-message error';
     status.textContent=/function.*not.*exist|schema cache|could not find/i.test(error?.message||'') ?
       'Opponent inbox is not activated yet. VXSK staff must install the staging database migration. No request was saved.' :
       /rate limit/i.test(error?.message||'')?'Please wait before sending another request.' :
       /sign in|confirm/i.test(error?.message||'')?error.message : 'Request NOT saved. Contact VXSK staff and try again.';
   } finally{submit.disabled=false;}
 });
})();
