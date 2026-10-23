'use strict';
// VXSK V12.8.14: consent-based, participant-only group text chats.
// All membership and read/write checks live in Supabase STAGING RPCs.
(() => {
  const $=id=>document.getElementById(id);
  const shell=$('vxsk-groups'); if(!shell)return;
  const newName=$('vxsk-group-name'), inviteList=$('vxsk-group-pick'), list=$('vxsk-groups-list');
  const thread=$('vxsk-group-thread'), title=$('vxsk-group-title'), participants=$('vxsk-group-people');
  const posts=$('vxsk-group-messages'), form=$('vxsk-group-form'), message=$('vxsk-group-text');
  const feedback=$('vxsk-group-feedback'), inviteMore=$('vxsk-group-invite'), leave=$('vxsk-group-leave');
  const countLabel=$('vxsk-groups-count');
  let selected=null,groups=[],friends=[],me=null,busy=false,lastIdentity=null,loading=false;
  const avatarPaths=new Map();
  const text=(tag,body,css='')=>{const e=document.createElement(tag);e.textContent=body??'';if(css)e.className=css;return e;};
  const alert=msg=>{feedback.textContent=msg;};
  function api(){return window.VXSKAuth?.client;}
  async function identity(){
    const c=api();if(!c)return null;
    const {data,error}=await c.auth.getUser();return error?null:data?.user||null;
  }
  async function rpc(name,args={}){
    const c=api();if(!c||!me)throw Error('Sign in to use group chats.');
    const {data,error}=await c.rpc(name,args);
    if(error){
      if(/schema cache|could not find|does not exist/i.test(error.message||''))throw Error('Group chat is not installed in STAGING. Run the V12.8.14 group SQL first.');
      throw Error('Group action could not be completed. Check membership or retry.');
    }
    return data;
  }
  function avatarFor(id,name,cls='vxsk-group-member-avatar'){
    const a=text('span',String(name||'?').charAt(0).toUpperCase(),cls);
    const path=avatarPaths.get(id)||friends.find(f=>f.peer_id===id)?.avatar_path;
    if(id===me?.id){
      const own=document.getElementById('nav-avatar');
      if(own&&!own.hidden&&own.src){const im=document.createElement('img');im.alt='';im.src=own.src;im.onerror=()=>im.remove();a.append(im);}
    }else if(path){void window.VXSKCommunity?.addVisibleAvatar?.(a,id,path);}
    return a;
  }
  async function refreshAvatarPaths(ids){
    const unique=[...new Set((ids||[]).filter(x=>typeof x==='string'))].slice(0,20);
    if(!unique.length)return;
    try{
      let out;
      try{out=await rpc('vxsk_social_avatar_lookup_v2',{p_ids:unique});}
      catch(_){out=await rpc('vxsk_social_avatar_lookup',{p_ids:unique});}
      if(Array.isArray(out))out.forEach(item=>{
        const ref=item.avatar_path||item.avatar_url||'';
        if(item.user_id&&ref)avatarPaths.set(item.user_id,ref);
      });
    }catch(_){/* If migration not applied, group text still works with initials. */}
  }
  function renderGroupPeople(members){
    participants.replaceChildren();participants.classList.add('vxsk-group-people');
    for(const member of members||[]){
      const chip=text('span',null,'vxsk-group-member-chip');
      chip.append(avatarFor(member.id,member.name),text('span',(member.name||'PLAYER')+(member.is_me?' (YOU)':'')));
      participants.append(chip);
    }
    if(!(members||[]).length)participants.textContent='Accepted group members';
  }
  function button(label,fn,variant=''){
    const b=text('button',label,'vxsk-group-btn '+variant);b.type='button';
    b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(err){alert(err.message);}finally{b.disabled=false;}});
    return b;
  }
  function reset(){avatarPaths.clear();selected=null;groups=[];friends=[];thread.hidden=true;list.replaceChildren();inviteList.replaceChildren();posts.replaceChildren();countLabel.hidden=true;}
  async function getFriends(){
    const state=await rpc('vxsk_social_my_state');
    friends=(Array.isArray(state?.links)?state.links:[]).filter(x=>x.status==='accepted');
    inviteList.replaceChildren();
    if(!friends.length){inviteList.append(text('p','Accept a friend request first to create a group.'));return;}
    for(const f of friends){
      const label=document.createElement('label');label.className='vxsk-group-choice';
      const input=document.createElement('input');input.type='checkbox';input.value=f.peer_id;input.name='vxsk-group-invitee';
      label.append(input,avatarFor(f.peer_id,f.nickname,'vxsk-group-choice-avatar'),text('span',f.nickname||'VXSK PLAYER'));inviteList.append(label);
    }
  }
  function friendsAvailable(group){
    const members=new Set((group?.members||[]).map(m=>m.id));
    return friends.filter(f=>!members.has(f.peer_id));
  }
  async function openGroup(id){
    const group=groups.find(g=>g.id===id && g.status==='active');
    if(!group){thread.hidden=true;selected=null;return;}
    selected=group.id;thread.hidden=false;
    title.textContent=group.name;
    await refreshAvatarPaths((group.members||[]).map(m=>m.id));
    renderGroupPeople(group.members||[]);
    inviteMore.hidden=group.owner!==me.id||!friendsAvailable(group).length;
    leave.textContent=group.owner===me.id?'DELETE GROUP':'LEAVE GROUP';
    await loadMessages();
  }
  async function loadMessages(){
    const id=selected;if(!id||document.hidden)return;
    const rows=await rpc('vxsk_group_history',{p_group:id});
    if(id!==selected)return;
    posts.replaceChildren();
    if(!Array.isArray(rows)){alert('You no longer have access to this group.');await refresh();return;}
    for(const r of rows){
      const p=text('div','', 'vxsk-group-post '+(r.from_me?'mine':''));
      const header=text('div',null,'vxsk-group-post-header');
      header.append(avatarFor(r.sender,r.nickname,'vxsk-group-post-avatar'),text('span',r.nickname+' · '+new Date(r.at).toLocaleString(),'vxsk-group-post-meta'));
      p.append(header,text('p',r.body));
      if(!r.from_me){p.append(button('REPORT',async()=>{
        const reason=prompt('Why are you reporting this message? (4–200 characters)');
        if(reason===null)return;
        if(reason.trim().length<4||reason.length>200){alert('Report reason must be 4–200 characters.');return;}
        const ok=await rpc('vxsk_group_report',{p_message:r.id,p_reason:reason.trim()});
        alert(ok?'Report saved. Staff review tooling must be configured before public launch.':'Could not save report.');
      },'report'));}
      posts.append(p);
    }
    if(!rows.length)posts.append(text('p','No messages yet. Only accepted members can read this conversation.'));
    posts.scrollTop=posts.scrollHeight;
  }
  async function refresh(){
    if(loading)return;loading=true;
    try{
      const current=await identity();
      if((current?.id||null)!==lastIdentity){reset();lastIdentity=current?.id||null;}
      me=current;
      if(!me){alert('Sign in to create or join private groups.');return;}
      groups=await rpc('vxsk_group_list');if(!Array.isArray(groups))groups=[];
      countLabel.hidden=!groups.some(g=>g.status==='invited');
      countLabel.textContent=String(groups.filter(g=>g.status==='invited').length);
      list.replaceChildren();
      for(const g of groups){
        const row=text('article','','vxsk-group-entry');
        const heading=text('strong',g.name);
        const subtitle=text('small',g.status==='invited'?'Invitation from '+g.invited_by:
          (g.members?.length||0)+' member(s) · private');
        row.append(heading,subtitle);
        if(g.status==='invited'){
          row.append(button('ACCEPT',async()=>{
            const ok=await rpc('vxsk_group_answer',{p_group:g.id,p_accept:true});
            alert(ok?'Joined group.':'Invitation unavailable.');await refresh();if(ok)await openGroup(g.id);
          }),button('DECLINE',async()=>{
            const ok=await rpc('vxsk_group_answer',{p_group:g.id,p_accept:false});
            alert(ok?'Invitation declined.':'Invitation unavailable.');await refresh();
          },'danger'));
        } else row.append(button('OPEN CHAT',()=>openGroup(g.id)));
        list.append(row);
      }
      if(!groups.length)list.append(text('p','No group chats yet. Invite accepted friends to start one.'));
      await getFriends();
      if(selected){
        const still=groups.find(g=>g.id===selected&&g.status==='active');
        if(!still){selected=null;thread.hidden=true;}
        else {await refreshAvatarPaths((still.members||[]).map(m=>m.id));renderGroupPeople(still.members||[]);
          inviteMore.hidden=still.owner!==me.id||!friendsAvailable(still).length;await loadMessages();}
      }
    }catch(e){alert(e.message||'Could not refresh groups.');}finally{loading=false;}
  }
  $('vxsk-group-create')?.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;busy=true;
    try{
      if(!me)throw Error('Sign in first.');
      const name=newName.value.trim();
      const ids=[...inviteList.querySelectorAll('input:checked')].map(n=>n.value);
      if(name.length<3||name.length>40)throw Error('Group name must be 3–40 characters.');
      if(ids.length<1||ids.length>7)throw Error('Select 1–7 accepted friends to invite.');
      const id=await rpc('vxsk_group_create',{p_name:name,p_invitees:ids});
      if(!id)throw Error('Could not create group. Friends must be accepted, unblocked, and within group limits.');
      newName.value='';alert('Group created. Friends must accept their invitations before viewing messages.');
      await refresh();await openGroup(id);
    }catch(err){alert(err.message);}finally{busy=false;}
  });
  form?.addEventListener('submit',async e=>{
    e.preventDefault();if(!selected||busy)return;busy=true;
    try{
      const body=message.value.trim();if(!body||body.length>500)return;
      const id=await rpc('vxsk_group_send',{p_group:selected,p_message:body});
      if(!id)throw Error('Message not sent. Check membership, blocks and rate limits.');
      message.value='';await loadMessages();
    }catch(err){alert(err.message);}finally{busy=false;}
  });
  $('vxsk-groups-refresh')?.addEventListener('click',refresh);
  $('vxsk-group-call-audio')?.addEventListener('click',()=>{if(selected)void window.VXSKGroupCalls?.start(selected,'audio',title.textContent);});
  $('vxsk-group-call-video')?.addEventListener('click',()=>{if(selected)void window.VXSKGroupCalls?.start(selected,'video',title.textContent);});
  $('vxsk-group-close')?.addEventListener('click',()=>{thread.hidden=true;selected=null;});
  inviteMore?.addEventListener('click',async()=>{
    const group=groups.find(g=>g.id===selected);
    if(!group||group.owner!==me?.id)return;
    const candidates=friendsAvailable(group);
    const choice=prompt('Invite an accepted friend by exact nickname:\n'+candidates.map(f=>f.nickname).join(', '));
    if(choice===null)return;
    const friend=candidates.find(f=>f.nickname?.toLowerCase()===choice.trim().toLowerCase());
    if(!friend){alert('Choose an accepted friend who is not already in the group.');return;}
    try{const ok=await rpc('vxsk_group_invite',{p_group:group.id,p_peer:friend.peer_id});
      alert(ok?'Invitation sent.':'Invitation unavailable. Check blocks or group capacity.');await refresh();}
    catch(e){alert(e.message);}
  });
  leave?.addEventListener('click',async()=>{
    const g=groups.find(x=>x.id===selected);if(!g)return;
    const owner=g.owner===me.id;
    if(!confirm(owner?'Delete this group and all its group messages for everyone?':'Leave this group? You will lose access to its messages.'))return;
    try{const ok=await rpc('vxsk_group_leave',{p_group:g.id});
      if(!ok)throw Error('Could not leave group.');reset();alert(owner?'Group deleted.':'You left the group.');await refresh();}
    catch(e){alert(e.message);}
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){void refresh();if(selected)void loadMessages();}});
  window.addEventListener('vxsk:auth-updated',refresh);
  window.addEventListener('vxsk:auth-change',refresh);
  setInterval(()=>{if(!document.hidden){void refresh();if(selected)void loadMessages();}},20000);
  setTimeout(()=>void refresh(),1500);
})();
