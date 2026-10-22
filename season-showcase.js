/* VXSK three-universe calendar: dates supplied by the event organizers.
   V12.8.9 STAGING mode applications require the accompanying secure registration SQL migration. */
'use strict';
(() => {
  const root=document.getElementById('season-detail');
  const grid=document.getElementById('season-phase-list');
  const buttons=[...document.querySelectorAll('[data-season]')];
  if(!root||!grid||!buttons.length) return;
  const media={
    rocket:{game:'Rocket League',title:'ROCKET LEAGUE',desc:'Four challenges. One unforgettable season.',images:['assets/mode-duel.webp','assets/mode-duo.webp','assets/mode-trio.webp','assets/mode-freestyle.webp'],accent:'rocket',months:[
      {mode:'1v1',title:'1V1 DUELS',from:'2026-10-17',to:'2026-11-17',description:'The solo challenge.'},
      {mode:'2v2',title:'2V2 SHOWMATCHES',from:'2026-11-20',to:'2026-12-20',description:'Two players. One team.'},
      {mode:'3v3',title:'3V3 SHOWMATCHES',from:'2026-12-25',to:'2027-01-25',description:'The ultimate team battle.'},
      {mode:'Freestyle',title:'FREESTYLE MASTERS',from:'2027-02-01',to:'2027-02-28',description:'The art of the impossible.'}
    ]},
    lol:{game:'League of Legends',title:'LEAGUE OF LEGENDS',desc:'ARAM battles, Summoner’s Rift and a special Mundo showdown.',images:['assets/lol-1v1-howling-abyss.jpg','assets/lol-5v5-aram-ornn.webp','assets/game-league-custom.webp','assets/lol-mundo-showmatch.jpg'],accent:'lol',months:[
      {mode:'1v1 ARAM',title:'1V1 ARAM',from:'2027-03-01',to:'2027-03-28',description:'One versus one on the Howling Abyss.'},
      {mode:'5v5 ARAM',title:'5V5 ARAM',from:'2027-04-01',to:'2027-04-28',description:'Full-team ARAM showmatches.'},
      {mode:"5v5 Summoner's Rift",title:'5V5 SUMMONER’S RIFT',from:'2027-05-01',to:'2027-05-28',description:'Five-player teams on Summoner’s Rift.'},
      {mode:'Mundo Showmatch',title:'MUNDO SHOWMATCH',from:'2027-07-01',to:'2027-07-28',description:'Special Dr. Mundo-themed showmatches.'}
    ]},
    valorant:{game:'VALORANT',title:'VALORANT',desc:'Skirmishes, team showmatches and a points-based Deathmatch finale.',images:['assets/showcase-valorant-team.webp','assets/valorant-5v5-phoenix-jett.webp','assets/valorant-2v2-skirmish.jpg','assets/game-valorant-custom.webp'],accent:'valorant',months:[
      {mode:'1v1 Skirmish',title:'1V1 SKIRMISH',from:'2027-08-01',to:'2027-08-28',description:'One-on-one tactical duels.'},
      {mode:'5v5 Showmatch',title:'5V5 SHOWMATCH',from:'2027-09-01',to:'2027-09-28',description:'Five-player tactical showmatches.'},
      {mode:'2v2 Skirmish',title:'2V2 SKIRMISH',from:'2027-10-01',to:'2027-10-28',description:'Duo tactical battles.'},
      {mode:'Deathmatch',title:'DEATHMATCH — POINTS',from:'2027-11-01',to:'2027-11-28',description:'Top cumulative showmatch points wins. Official scoring rules to be confirmed.'}
    ]}
  };
  const d = iso => new Date(iso+'T12:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).toUpperCase();
  const label = item => {
    const today=new Date().toISOString().slice(0,10);
    if(today<item.from)return 'UP NEXT';
    if(today>item.to)return 'PHASE ENDED';
    return 'CURRENT PHASE';
  };
  let current='rocket';
  function render(key, animate=true){
    if(!media[key])return;
    current=key;const game=media[key];
    buttons.forEach(b=>{let selected=b.dataset.season===key;b.classList.toggle('is-selected',selected);b.setAttribute('aria-pressed',String(selected));});
    root.dataset.activeSeason=key;
    const title=document.getElementById('season-detail-title');title.replaceChildren();
    title.append(document.createTextNode(game.title+' '));
    const span=document.createElement('span');span.textContent='PHASES';title.append(span);
    document.querySelector('.season-detail-eyebrow').textContent='SELECTED UNIVERSE / '+String(['rocket','lol','valorant'].indexOf(key)+1).padStart(2,'0');
    document.getElementById('season-detail-desc').textContent=game.desc;
    document.getElementById('season-notice').textContent=key==='rocket'
      ?'Rocket League applications are open for available formats. Applying does not guarantee selection.'
      :'The calendar is planned for 2027. Mode applications require the V12.8.8 STAGING registration migration. Selection is not guaranteed.';
    const fragment=document.createDocumentFragment();
    game.months.forEach((item,i)=>{
      const card=document.createElement('article');card.className='season-phase-card';card.style.setProperty('--entry-order',String(i));
      const visual=document.createElement('div');visual.className='season-phase-art';
      const img=document.createElement('img');img.src=game.images[i];img.alt='';img.loading='lazy';visual.append(img);
      const top=document.createElement('span');top.className='season-phase-index';top.textContent='PHASE '+String(i+1).padStart(2,'0')+' / 04';visual.append(top);
      const flag=document.createElement('span');flag.className='season-phase-status';flag.textContent=label(item);visual.append(flag);
      const body=document.createElement('div');body.className='season-phase-body';
      const timeframe=document.createElement('p');timeframe.className='season-phase-timeframe';timeframe.textContent=d(item.from)+' — '+d(item.to);
      const h=document.createElement('h4');h.textContent=item.title;
      const description=document.createElement('p');description.className='season-phase-description';description.textContent=item.description;
      const cta=document.createElement('button');cta.type='button';cta.className='season-phase-cta';cta.textContent='APPLY FOR '+item.mode.toUpperCase()+' ↗';
      cta.addEventListener('click',()=>{
        if(typeof window.VXSKOpenRegistration!=='function')return;
        window.VXSKOpenRegistration(game.game,item.mode,cta);
      });
      body.append(timeframe,h,description,cta);card.append(visual,body);fragment.append(card);
    });
    grid.replaceChildren(fragment);
    if(animate && !matchMedia('(prefers-reduced-motion: reduce)').matches){
      grid.classList.remove('season-animate');void grid.offsetWidth;grid.classList.add('season-animate');
    }
  }
  buttons.forEach(button=>button.addEventListener('click',()=>render(button.dataset.season)));
  document.querySelectorAll('[data-season-link]').forEach(a=>a.addEventListener('click',()=>render(a.dataset.seasonLink)));
  window.VXSKSelectSeason = render;
  render('rocket',false);
})();
