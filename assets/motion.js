/* Sahaby motion layer (GSAP + ScrollTrigger + Lenis). Progressive: without JS/GSAP nothing is hidden. */
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover:hover) and (pointer:fine)').matches && innerWidth >= 1024;
  const H = document.documentElement, hdr = document.querySelector('.header');
  const g = window.gsap, ST = window.ScrollTrigger;
  /* header slides away while scrolling down and returns on scroll up (cheap, works without GSAP) */
  let lastY = scrollY, tick = false;
  const onS = () => { tick = false; const y = scrollY;
    if (hdr && !document.body.classList.contains('menu-open')) hdr.classList.toggle('hide', y > lastY && y > 240 && !hdr.contains(document.activeElement));
    lastY = y; };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(onS); } }, {passive: true});
  hdr && hdr.addEventListener('focusin', () => hdr.classList.remove('hide'));
  if (RM || !g || !ST) return;            // reduced motion or CDN failed: static, fully visible site
  g.registerPlugin(ST); H.classList.add('js-motion');
  /* Lenis smooth scroll on desktop pointer devices only */
  if (FINE && window.Lenis) {
    H.classList.add('sh-lenis');                       // disables CSS scroll-behavior:smooth (see motion.css)
    const l = new Lenis({lerp: .18, wheelMultiplier: 1.15, touchMultiplier: 1, smoothWheel: true, autoRaf: false});
    l.on('scroll', ST.update);
    g.ticker.add(t => l.raf(t * 1000)); g.ticker.lagSmoothing(0);   // single loop: GSAP ticker only
    window.__lenis = l;
    const off = () => -((hdr && hdr.offsetHeight) || 0) - 16, ease = t => 1 - Math.pow(1 - t, 3);
    document.querySelectorAll('.to-top').forEach(b => b.addEventListener('click', e => { e.stopImmediatePropagation(); l.scrollTo(0, {duration: .6, easing: ease}); }, true));
    document.addEventListener('click', e => { const a = e.target.closest('a[href*="#"]'); if (!a || e.defaultPrevented) return;
      const u = new URL(a.href, location.href); if (u.pathname !== location.pathname || !u.hash || u.hash.length < 2) return;
      const t = document.getElementById(decodeURIComponent(u.hash.slice(1))); if (!t) return;
      e.preventDefault(); l.scrollTo(Math.max(0, l.scroll + t.getBoundingClientRect().top + off()), {duration: .6, easing: ease}); history.replaceState(null, '', u.hash); }); }
  const E = 'power3.out';
  /* hero text rises in (no splash intro: the store opens straight onto the products) */
  document.querySelectorAll('.slide-content').forEach(x => g.fromTo(x.children, {y: 16, opacity: 0}, {y: 0, opacity: 1, duration: .8, ease: E, stagger: .1, delay: .1}));
  /* scroll reveals: a short, quiet fade-up per block (children of lists and grids stagger) */
  const groups = ['.sec-head', '.grid', '.stories', '.rv-grid', '.faq-list', '.ab-row', '.vals', '.steps', '.why', '.verse', '.card', '.pf-rows', '.pf-banner', '.pf-grid', '.ab-cta'];
  const reveal = root => { document.querySelectorAll(groups.join(',')).forEach(el => { if (el.dataset.rvd || (root && !root.contains(el))) return; el.dataset.rvd = 1;
    const kids = el.matches('.grid,.stories,.rv-grid,.vals,.steps,.pf-rows,.pf-grid') ? [...el.children] : [el]; kids.forEach(k => k.setAttribute('data-rv', ''));
    g.fromTo(kids, {opacity: 0, y: 16}, {opacity: 1, y: 0, duration: .6, ease: E, stagger: .06, clearProps: 'transform', scrollTrigger: {trigger: el, start: 'top 90%', once: true}}); }); };
  reveal();
  /* counters (e.g. "أكثر من 1000 عميل") */
  document.querySelectorAll('.sec-head p, .why b, .stat b, [data-count]').forEach(el => { const tn = [...el.childNodes].find(n => n.nodeType === 3 && /\d{2,}/.test(n.nodeValue)); if (!tn) return;
    const m = tn.nodeValue.match(/\d{2,}/), end = +m[0], pre = tn.nodeValue.slice(0, m.index), post = tn.nodeValue.slice(m.index + m[0].length), o = {v: 0};
    g.to(o, {v: end, duration: 1.8, ease: 'power2.out', scrollTrigger: {trigger: el, start: 'top 90%', once: true}, onUpdate: () => tn.nodeValue = pre + Math.round(o.v) + post}); });
  /* products page: fade the re-rendered grid in after a filter change */
  const grid = document.getElementById('grid');
  if (grid) new MutationObserver(() => { const k = [...grid.children]; k.forEach(c => c.dataset.rv = ''); g.fromTo(k, {opacity: 0, y: 10}, {opacity: 1, y: 0, duration: .4, ease: E, stagger: .03, clearProps: 'transform'}); }).observe(grid, {childList: true});
  /* late-rendered content (product page builds DOM in JS) */
  new MutationObserver(() => reveal()).observe(document.querySelector('main') || document.body, {childList: true, subtree: true});
  addEventListener('load', () => ST.refresh());
  /* safety net: never leave content hidden */
  setTimeout(() => document.querySelectorAll('[data-rv]').forEach(e => { if (getComputedStyle(e).opacity === '0' && e.getBoundingClientRect().top < innerHeight) g.to(e, {opacity: 1, y: 0, duration: .4}); }), 4000);
})();
