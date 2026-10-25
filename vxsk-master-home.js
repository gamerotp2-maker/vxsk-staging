'use strict';
/* VXSK V12.9.4 master preview: additive UI only. No RPC, payments, role changes or user-data collection. */
(() => {
  const start = () => {
    const $ = id => document.getElementById(id);
    const make = (tag, cls, value) => { const n=document.createElement(tag); if(cls)n.className=cls; if(value!==undefined)n.textContent=value; return n; };
    const accountDialog=$('account-dialog');
    function showDms(){
      // Use the existing auth-controlled account opener, not a second account/login handler.
      if (!accountDialog?.open || $('account-profile')?.hidden) {
        document.querySelector('.account-nav.open-account')?.click();
      }
      // My Account P2 puts the *original* live community nodes inside these tabs.
      const reveal = () => {
        const main=$('vxsk-ah-tab-community');
        const friends=$('vxsk-ah-community-tab-friends');
        if(!main || !friends)return;
        main.click();friends.click();
        const chat=$('community-chat');
        if(chat && !chat.hidden){chat.scrollIntoView({block:'nearest',behavior:'smooth'});return;}
        $('community-friends')?.scrollIntoView({block:'nearest',behavior:'smooth'});
      };
      reveal();setTimeout(reveal,80);
    }
    // Repair legacy header DM shortcuts only; never intercept compose/send/message actions.
    document.addEventListener('click',event=>{
      const b=event.target.closest?.('#nav-dm-toggle, #nav-dm, .nav-dm-toggle, .nav-dm-btn, [data-open-dms], a[href="#community-chat"], .vxsk-master-dms');
      const headerTarget=event.target.closest?.('.header button, .header a');
      const text=(headerTarget?.getAttribute('aria-label')||'')+' '+(headerTarget?.getAttribute('title')||'');
      if(!b && !(headerTarget && /\bdirect messages\b|\bDMs?\b/i.test(text)))return;
      event.preventDefault();event.stopPropagation();showDms();
    },true);
    const nav=document.querySelector('.header .vxsk-community-nav');
    if(nav && !$('vxsk-master-dm-shortcut') && !document.querySelector('#nav-dm-toggle, #nav-dm, .nav-dm-toggle, .nav-dm-btn, [data-open-dms], .header [aria-label*="direct message" i], .header [title*="direct message" i]')){
      const b=make('button','vxsk-master-dms','✉ DMs'); b.type='button';b.id='vxsk-master-dm-shortcut';
      b.title='Open your direct messages in My Account';b.setAttribute('aria-label','Open direct messages in My Account');
      nav.append(b);
    }
    // Public naming: two intentionally separate content categories, preserving old element IDs.
    const updates=$('bulletin-announcements')?.closest('.bulletin-column');
    const heading=updates?.querySelector('.bulletin-column-head h3');
    if(heading)heading.textContent='WEBSITE UPDATES';
    const eyebrow=updates?.querySelector('.bulletin-column-head span');
    if(eyebrow)eyebrow.textContent='01 / SERVER & COMMUNITY NEWS';
    const empty=updates?.querySelector('.empty-state h3');if(empty && /NEWS COMING SOON/i.test(empty.textContent))empty.textContent='UPDATES COMING SOON';
    // Remove deprecated No Opponent UI without deleting historical Supabase records.
    $('find-rival')?.setAttribute('hidden','');
    for(const a of document.querySelectorAll('a[href="#find-rival"],button[data-staff-tab="opponents"]'))a.hidden=true;
    const oldOpp=$('my-opponents-title');if(oldOpp){const wrapper=oldOpp.closest('.account-option, .account-card, section');if(wrapper && wrapper!==$('account-profile'))wrapper.hidden=true;}
    // Shop preview: transparent coming-soon status. No order acceptance, no payment form.
    if(!$('vxsk-master-shop')){
      const section=make('section','vxsk-master-shop');section.id='vxsk-master-shop';section.setAttribute('aria-label','VXSK shop preview');
      const wrap=make('div','vxsk-master-shop-inner');
      const lead=make('div','vxsk-master-shop-lead');lead.append(make('span','vxsk-master-kicker','VXSK / COMING SOON'), make('h2','','SHOP & MERCH'));
      lead.append(make('p','','Preview only — orders and payment methods are not active. No money or account credentials are collected here.'));
      const cards=make('div','vxsk-master-shop-cards');
      function card(icon,title,info,status){const a=make('article','vxsk-master-shop-card');a.append(make('div','vxsk-master-shop-icon',icon),make('h3','',title),make('p','',info),make('strong','',status));return a;}
      cards.append(card('👕','VXSK T-SHIRT','Official VXSK merch concept. Final size and delivery options to be confirmed.','60 TND · COMING SOON'));
      cards.append(card('🎯','COMPETITIVE COACHING','Rocket League, VALORANT and League of Legends improvement sessions. No account sharing or rank-boosting service is active.','SERVICE NOT OPEN'));
      cards.append(card('⚔','SHOWMATCH REMATCH REQUEST','Optional 1v1 rematch ticket idea, subject to event rules and payment verification.','5 TND PROPOSAL · NOT FOR SALE'));
      const note=make('p','vxsk-master-shop-note','Planned options: D17 (La Poste Tunisienne), Ooredoo, Orange Tunisie and Tunisie Telecom (TT). COMING SOON - no payments can be made here. No payment provider is connected or endorsed.');
      wrap.append(lead,cards,note);section.append(wrap);
      const main=$('main')||document.querySelector('main');
      if(main)main.append(section);
    }
    // Anchor link for the concept shop, without disrupting the site navigation ordering.
    const links=$('nav-links');
    if(links && !links.querySelector('a[href="#vxsk-master-shop"]')){
      const a=make('a','vxsk-master-shop-link','SHOP');a.href='#vxsk-master-shop';links.append(a);
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
