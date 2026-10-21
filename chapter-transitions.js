'use strict';
(() => {
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 if(media.matches || !('IntersectionObserver' in window))return;
 const chapters=[...document.querySelectorAll('main > section.section')];
 if(!chapters.length)return;
 document.documentElement.classList.add('chapter-motion');
 const obs=new IntersectionObserver(entries=>{
   for(const e of entries)if(e.isIntersecting){e.target.classList.add('chapter-seen');obs.unobserve(e.target);}
 },{rootMargin:'0px 0px -8% 0px',threshold:.04});
 chapters.forEach(s=>obs.observe(s));
})();
