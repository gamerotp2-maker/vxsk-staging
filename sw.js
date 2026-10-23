/* VXSK staging: same-origin public static assets only. NEVER cache Supabase API,
   auth tokens, requests with Authorization headers, responses with Set-Cookie,
   or RTC signaling. This is an installability / load optimization, not DDoS mitigation. */
'use strict';
const VER='vxsk-public-v12.8.34';
const ASSETS=['./','./index.html','./arena.html','./styles.css','./arena-hub.css','./app.js','./arena-hub.js','./favicon.svg','./assets/vxsk-wordmark.webp'];
self.addEventListener('install',ev=>ev.waitUntil(caches.open(VER).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()).catch(()=>{})));
self.addEventListener('activate',ev=>ev.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('vxsk-public-')&&k!==VER).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',ev=>{
  const req=ev.request;if(req.method!=='GET'||req.headers.has('Authorization')||req.headers.has('Cookie'))return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  if(url.pathname.includes('/functions/')||url.pathname.includes('/auth/')||url.pathname.endsWith('supabase-config.js'))return;
  if(req.mode==='navigate'){
    ev.respondWith(fetch(req).catch(()=>caches.match('./arena.html').then(r=>r||caches.match('./index.html'))));return;
  }
  if(!/\.(?:css|js|svg|png|jpe?g|webp|woff2?)$/i.test(url.pathname))return;
  ev.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{
    if(response.ok&&response.type==='basic'&&response.headers.get('cache-control')!=='no-store'&&!response.headers.has('set-cookie')){
      const copy=response.clone();ev.waitUntil(caches.open(VER).then(async cache=>{
        const keys=await cache.keys();if(keys.length<100)await cache.put(req,copy);
      }));
    }
    return response;
  })));
});
