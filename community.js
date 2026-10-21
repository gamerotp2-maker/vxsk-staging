/* VXSK community — opt-in, accepted-friends-only messaging.
   Requires VXSK-V12.8.7-STAGING-SOCIAL.sql. No direct access to private auth.users. */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const search=$('community-search'), results=$('community-results'), info=$('community-feedback');
  if(!search||!results)return;
  const friendsEl=$('community-friends');
  const btnIn=$('community-optin'),btnOut=$('community-optout');
  const chat=$('community-chat'),chatTitle=$('community-chat-with'),messages=$('community-messages');
  let client=null,user=null, snapshot=null,peer=null,peerName='',lastTerm='';
  const categoryMap=[
    ['Rocket League','#games','Game · Four seasonal modes'],
    ['League of Legends','#modes','Game · 2027 calendar'],
    ['VALORANT','#modes','Game · 2027 calendar'],
    ['Showmatches & event modes','#modes','Calendar · Twelve seasonal phases'],
    ['Match fixtures & announcements','#match-center','Official news and pairings'],
    ['No Opponent / Find Rival','#find-rival','Private staff matchmaking request'],
    ['Team & Staff','#staff','Meet the VXSK crew'],
    ['Contact','#contact','VXSK social and email contacts'],
    ['My Account','#members','Player account and applications']
  ];
  function note(message){info.textContent=message;}
  const el=(tag,content,cls)=>{const out=document.createElement(tag);if(content!==undefined)out.textContent=String(content);if(cls)out.className=cls;return out;};
  function action(label,callback,variant=''){
    const button=el('button',label,'community-action '+variant);button.type='button';button.addEventListener('click',async()=>{
      button.disabled=true;
      try{await callback();}catch(e){note('Request failed. Please try again.');console.warn('VXSK community:',e?.message||'error');}
      finally{button.disabled=false;}
    });return button;
  }
  async function getSession(){
    client=window.VXSKAuth?.client;
    if(!client)return false;
    const {data,error}=await client.auth.getUser();
    user=error?null:data?.user;
    return Boolean(user);
  }
  async function rpc(name,args={}){
    if(!await getSession()){note('Sign in to manage your friends and messages.');document.querySelector('.open-account')?.click();return {ok:false};}
    const {data,error}=await client.rpc(name,args);
    if(error){
      if(/function.*(not|missing)|schema cache|could not find/i.test(error.message||'')){
        note('The VXSK community database is not installed in STAGING yet. This is a safe preview; no request was sent.');
      } else note('Action could not be completed. Check your profile, friendship or permissions.');
      console.warn('VXSK community RPC:',name,error?.code||'error');
      return {ok:false};
    }
    return {ok:true,data};
  }
  function makeEntry(title,desc,buttons=[]){
    const card=el('article',undefined,'community-entry');
    const words=el('div',undefined,'community-entry-copy');words.append(el('strong',title),el('small',desc));card.append(words);
    const group=el('div',undefined,'community-entry-actions');buttons.forEach(b=>group.append(b));card.append(group);return card;
  }
  function handleSearch(){
    const term=search.value.trim().slice(0,30);lastTerm=term;results.replaceChildren();
    const categoryHits=categoryMap.filter(x=>!term||x[0].toLowerCase().includes(term.toLowerCase()) || x[2].toLowerCase().includes(term.toLowerCase()));
    for(const [name,href,subtitle] of categoryHits){const link=el('a','OPEN CATEGORY ↗','community-category-link');link.href=href;results.append(makeEntry(name,subtitle,[link]));}
    if(term.length<2){note('Search categories, or enter at least two characters to search discoverable player nicknames.');return;}
    searchPlayers(term);
  }
  async function searchPlayers(term){
    if(!await getSession()) {note('Showing categories. Sign in to search players who opted in.');return;}
    const response=await rpc('vxsk_social_find',{p_term:term});
    if(!response.ok || term!==lastTerm)return;
    const players=response.data||[];
    for(const p of players){
      const buttons=[action('ADD FRIEND ↗',async()=>{
        const r=await rpc('vxsk_social_request',{p_peer:p.user_id});
        if(r.ok)note(r.data?'Friend request sent.':'Request not sent. Check pending invitations or blocks.');
        await refreshState();
      }), action('BLOCK',async()=>{
        if(!confirm('Block this player? They will not be able to find or message you.'))return;
        const r=await rpc('vxsk_social_block',{p_peer:p.user_id,p_block:true});
        if(r.ok){note('Player blocked.');handleSearch();await refreshState();}
      },'danger')];
      results.append(makeEntry(p.nickname,'VXSK PLAYER · PUBLIC NICKNAME ONLY',buttons));
    }
    note(players.length?'Search shows only players who enabled discovery. Private contacts are never shown.':'No discoverable players found. Browse the matching categories above.');
  }
  async function refreshState(){
    if(!await getSession()){friendsEl.replaceChildren(el('p','Sign in to manage friends.'));return;}
    const response=await rpc('vxsk_social_my_state');if(!response.ok){friendsEl.replaceChildren(el('p','Community setup required in staging.'));return;}
    snapshot=response.data||{};
    if(snapshot.profile){btnIn.hidden=Boolean(snapshot.profile.discoverable);btnOut.hidden=!snapshot.profile.discoverable;}
    else {btnIn.hidden=false;btnOut.hidden=true;}
    friendsEl.replaceChildren();
    const links=Array.isArray(snapshot.links)?snapshot.links:[];
    const blocks=Array.isArray(snapshot.blocked)?snapshot.blocked:[];
    if(!links.length&&!blocks.length) friendsEl.append(el('p','No friends or invitations yet.'));
    for(const item of links){
      let state=item.status==='accepted'?'FRIEND':item.status==='pending'?(item.outgoing?'INVITE SENT':'NEW INVITE'):'DECLINED';
      const a=[];
      if(item.status==='pending'&&!item.outgoing){
        a.push(action('ACCEPT',async()=>{const r=await rpc('vxsk_social_answer',{p_peer:item.peer_id,p_accept:true});if(r.ok)await refreshState();}));
        a.push(action('REJECT',async()=>{const r=await rpc('vxsk_social_answer',{p_peer:item.peer_id,p_accept:false});if(r.ok)await refreshState();},'danger'));
      }
      if(item.status==='accepted')a.push(action('MESSAGE',()=>openChat(item.peer_id,item.nickname||'PLAYER')));
      if(item.status!=='rejected')a.push(action('BLOCK',async()=>{
        if(!confirm('Block this player and remove your friendship or request?'))return;
        const r=await rpc('vxsk_social_block',{p_peer:item.peer_id,p_block:true});if(r.ok){if(peer===item.peer_id)closeChat();await refreshState();}
      },'danger'));
      friendsEl.append(makeEntry(item.nickname||'VXSK PLAYER',state,a));
    }
    for(const item of blocks){
      friendsEl.append(makeEntry(item.nickname||'BLOCKED PLAYER','BLOCKED',[action('UNBLOCK',async()=>{
        const r=await rpc('vxsk_social_block',{p_peer:item.peer_id,p_block:false});if(r.ok)await refreshState();
      })]));
    }
  }
  async function setProfile(visible){
    if(!await getSession())return;
    const suggested=(snapshot?.profile?.nickname || user.user_metadata?.vxsk_nickname || user.user_metadata?.nickname || '').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,24);
    const choice=prompt(visible?'Choose the nickname that other VXSK players may search for:':'Your VXSK community nickname:',suggested);
    if(choice===null)return;
    if(!/^[A-Za-z0-9_.-]{3,24}$/.test(choice)){note('Nickname must be 3–24 letters, numbers, dots, dashes or underscores.');return;}
    const r=await rpc('vxsk_social_profile',{p_nickname:choice,p_visible:visible});
    if(r.ok){note(r.data?(visible?'Profile discoverable.':'Profile hidden from search.'):'Nickname unavailable. Choose another nickname.');await refreshState();}
  }
  async function hideProfile(){
    if(!await getSession()||!snapshot?.profile)return;
    if(!confirm('Hide your nickname from new player searches? Existing friendships remain.'))return;
    const r=await rpc('vxsk_social_profile',{p_nickname:snapshot.profile.nickname,p_visible:false});
    if(r.ok){note('Your profile is hidden from search.');await refreshState();}
  }
  async function openChat(id,name){peer=id;peerName=name;chat.hidden=false;chatTitle.textContent='PRIVATE CHAT · '+name;await refreshChat();chat.scrollIntoView({behavior:'smooth',block:'nearest'});}
  function closeChat(){peer=null;chat.hidden=true;messages.replaceChildren();}
  async function refreshChat(){
    if(!peer||document.hidden)return;
    const requestedPeer=peer;
    const r=await rpc('vxsk_social_dm_history',{p_peer:peer});if(!r.ok||peer!==requestedPeer)return;
    messages.replaceChildren();
    for(const entry of (r.data||[]).slice().reverse()){
      const line=el('div',undefined,'community-message '+(entry.from_me?'from-me':'from-friend'));
      line.append(el('span',entry.body));
      const time=el('small',new Date(entry.sent_at).toLocaleString());line.append(time);
      if(!entry.from_me){line.append(action('REPORT',async()=>{
        const reason=prompt('Why are you reporting this message? (4–200 characters)');
        if(reason===null)return;
        if(reason.length<4||reason.length>200){note('Please describe the issue in 4–200 characters.');return;}
        const outcome=await rpc('vxsk_social_report_dm',{p_message_id:entry.message_id,p_reason:reason});
        if(outcome.ok)note(outcome.data?'Message reported to the VXSK moderation queue.':'Report could not be submitted.');
      },'report'));}
      messages.append(line);
    }
    if(!(r.data||[]).length)messages.append(el('p','You are connected. Say hello without sharing personal details.'));
    messages.scrollTop=messages.scrollHeight;
  }
  $('community-go').addEventListener('click',handleSearch);
  search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();handleSearch();}});
  btnIn.addEventListener('click',()=>setProfile(true));
  btnOut.addEventListener('click',hideProfile);
  $('community-refresh').addEventListener('click',refreshState);
  $('community-chat-close').addEventListener('click',closeChat);
  $('community-message-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!peer)return;
    const box=$('community-message-text');const text=box.value.trim();
    if(!text||text.length>500)return;
    const r=await rpc('vxsk_social_send_dm',{p_peer:peer,p_message:text});
    if(r.ok){if(r.data){box.value='';await refreshChat();}else note('Message not sent. You must be accepted friends and under the message rate limit.');}
  });
  window.addEventListener('vxsk:auth-updated',refreshState);
  window.addEventListener('vxsk:auth-change',refreshState);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&peer)refreshChat();});
  setInterval(()=>{if(peer&&!document.hidden)refreshChat();},20000);
  handleSearch();
  // Async auth can finish after this module initializes.
  setTimeout(refreshState,1200);
})();
