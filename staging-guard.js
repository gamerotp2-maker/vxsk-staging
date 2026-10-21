/* Hard stop if a test Netlify hostname is accidentally configured against VXSK production. */
'use strict';
(() => {
  const cfg=window.VXSK_SUPABASE||{};
  const host=location.hostname.toLowerCase();
  const isPreview=(host.endsWith('.netlify.app')&&host!=='vxsk-events.netlify.app') || host.endsWith('.github.io');
  const expectedStaging='https://opzqnmahfgehaewgciwg.supabase.co';
  const blocked=isPreview && String(cfg.url||'').toLowerCase()!==expectedStaging;
  Object.defineProperty(window,'VXSK_STAGING_BLOCKED',{value:blocked,writable:false,configurable:false});
  if(!blocked)return;
  const banner=document.createElement('div');banner.className='vxsk-staging-guard';
  banner.setAttribute('role','alert');
  banner.textContent='STAGING SAFETY LOCK: Test website is NOT pointed at the approved staging Supabase project. Authentication and data requests are blocked until you configure a separate staging database.';
  document.body.prepend(banner);
})();
