/* Sahaby shared UX layer: accessible mobile menu, sticky header state, scroll-to-top. */
(() => {
  const hdr = document.querySelector('.header'), burger = document.querySelector('.burger'), mm = document.getElementById('mm');
  const setH = () => hdr && document.documentElement.style.setProperty('--hdr', hdr.offsetHeight + 'px');
  setH(); addEventListener('resize', setH);
  if (burger && mm) {
    burger.setAttribute('aria-controls', 'mm'); burger.setAttribute('aria-expanded', 'false');
    mm.setAttribute('aria-label', 'القائمة');
    const set = open => {
      burger.classList.toggle('open', open); mm.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', String(open)); document.body.classList.toggle('menu-open', open);
      burger.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'القائمة');
      mm.querySelectorAll('a').forEach(a => a.tabIndex = open ? 0 : -1);
      if (open) { const f = mm.querySelector('a'); f && f.focus({preventScroll: true}); }
    };
    set(false);
    burger.addEventListener('click', e => { e.stopPropagation(); set(!mm.classList.contains('open')); });
    mm.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
    document.addEventListener('click', e => { if (mm.classList.contains('open') && !mm.contains(e.target) && !burger.contains(e.target)) set(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && mm.classList.contains('open')) { set(false); burger.focus(); } });
    addEventListener('resize', () => { if (innerWidth > 860 && mm.classList.contains('open')) set(false); });
  }
  const top = document.createElement('button');
  top.className = 'to-top'; top.type = 'button'; top.setAttribute('aria-label', 'العودة إلى الأعلى');
  top.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
  top.onclick = () => { scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); const s = document.querySelector('.skip'); };
  document.body.appendChild(top);
  const onScroll = () => { const y = scrollY; top.classList.toggle('on', y > 700); hdr && hdr.classList.toggle('scrolled', y > 8); };
  addEventListener('scroll', onScroll, {passive: true}); onScroll();
})();

/* Offer links carry ?promo=CODE; remember it for this visit so the order form can apply it */
(function(){try{var c=new URLSearchParams(location.search).get('promo');if(c)sessionStorage.setItem('sahaby_promo',c.replace(/\s/g,'').toUpperCase().slice(0,30))}catch(e){}})();

/* QA: keep the WhatsApp float from covering the COD form on mobile */
(function(){if(!('IntersectionObserver' in window))return;var t=setInterval(function(){var f=document.getElementById('f');if(!f)return;clearInterval(t);
 new IntersectionObserver(function(e){document.body.classList.toggle('form-in-view',e[0].isIntersecting)},{rootMargin:'-10% 0px -10% 0px'}).observe(f)},300);setTimeout(function(){clearInterval(t)},8000)})();
