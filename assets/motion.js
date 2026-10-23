/* Sahaby motion layer (GSAP + ScrollTrigger + Lenis). Progressive: without JS/GSAP nothing is hidden. */
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover:hover) and (pointer:fine)').matches && innerWidth >= 1024;
  const H = document.documentElement, hdr = document.querySelector('.header');
  const g = window.gsap, ST = window.ScrollTrigger;
  /* scroll progress + header hide/show (cheap, works without GSAP) */
  const bar = document.createElement('div'); bar.className = 'scroll-prog'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
  let lastY = scrollY, tick = false;
  const onS = () => { tick = false; const y = scrollY, m = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${m > 0 ? y / m : 0})`;
    if (hdr && !document.body.classList.contains('menu-open')) hdr.classList.toggle('hide', y > lastY && y > 240 && !hdr.contains(document.activeElement));
    lastY = y; };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(onS); } }, {passive: true});
  hdr && hdr.addEventListener('focusin', () => hdr.classList.remove('hide'));
  /* product gallery: keep fade on content swap (CSS anim on #gm children) */
  /* Ken Burns layer on hero slides */
  if (!RM) document.querySelectorAll('.slide').forEach(s => { if (!s.querySelector('.kb')) { const k = document.createElement('div'); k.className = 'kb'; k.setAttribute('aria-hidden', 'true'); s.prepend(k); } });
  /* page transition for internal links */
  if (!RM) { const pt = document.createElement('div'); pt.className = 'pt'; document.body.appendChild(pt);
    document.addEventListener('click', e => { const a = e.target.closest('a[href]'); if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || a.target || a.hasAttribute('download')) return;
      const u = new URL(a.href, location.href); if (u.origin !== location.origin || !/\.html$|\/$/.test(u.pathname) || (u.pathname === location.pathname && u.hash) || /admin\//.test(u.pathname)) return;
      e.preventDefault(); pt.classList.add('on'); setTimeout(() => location.href = u.href, 320); });
    addEventListener('pageshow', () => pt.classList.remove('on')); }
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
  /* intro once per session (index only), skippable */
  const hero = () => { const c = document.querySelectorAll('.slide-content'); c.forEach(x => g.fromTo(x.children, {y: 28, opacity: 0}, {y: 0, opacity: (i, el) => el.matches('p') ? .9 : 1, duration: 1, ease: E, stagger: .12, delay: .1})); };
  const isHome = !!document.querySelector('.slider');
  if (isHome && !sessionStorage.getItem('shIntro')) { sessionStorage.setItem('shIntro', '1');
    const o = document.createElement('div'); o.className = 'intro'; o.setAttribute('role', 'presentation'); o.innerHTML = '<b>صحابي</b><i></i><small>اضغط للتخطي</small>'; document.body.appendChild(o);
    const tl = g.timeline({onComplete: () => { o.remove(); hero(); }});
    tl.to(o.querySelector('b'), {clipPath: 'inset(0 0 0 0%)', duration: 1.1, ease: 'power2.inOut'}).to(o.querySelector('i'), {scaleX: 1, duration: .6, ease: E}, '-=.4').to(o, {yPercent: -100, duration: .8, ease: 'power3.inOut'}, '+=.25');
    const skip = () => tl.progress(1); o.addEventListener('click', skip); addEventListener('keydown', skip, {once: true}); setTimeout(skip, 3500);
  } else hero();
  /* scroll reveals */
  const groups = ['.sec-head', '.features', '.grid', '.fx', '.rv-grid', '.faq-list', '.faq-cta', '.ab-row', '.ab', '.vals', '.steps', '.why', '.mv', '.verse', '.card', '.f-top', '.pf', '.pl-hero', '.e404, .nf'];
  const reveal = root => { document.querySelectorAll(groups.join(',')).forEach(el => { if (el.dataset.rvd || (root && !root.contains(el))) return; el.dataset.rvd = 1;
    const kids = el.matches('.grid,.features,.rv-grid,.faq-list,.vals,.steps,.mv') ? [...el.children] : [el]; kids.forEach(k => k.setAttribute('data-rv', ''));
    g.fromTo(kids, {opacity: 0, y: 34}, {opacity: 1, y: 0, duration: .9, ease: E, stagger: .08, clearProps: 'transform', scrollTrigger: {trigger: el, start: 'top 88%', once: true}}); }); };
  reveal();
  /* image mask reveals + parallax */
  document.querySelectorAll('.fx-img, .ab-img').forEach(w => { const img = w.querySelector('img');
    g.fromTo(w, {clipPath: 'inset(0 0 100% 0)'}, {clipPath: 'inset(0 0 0% 0)', duration: 1.3, ease: 'power3.inOut', scrollTrigger: {trigger: w, start: 'top 85%', once: true}});
    if (img && FINE) g.fromTo(img, {yPercent: -6, scale: 1.12}, {yPercent: 6, scale: 1.12, ease: 'none', scrollTrigger: {trigger: w, start: 'top bottom', end: 'bottom top', scrub: true}}); });
  /* counters (e.g. "أكثر من 1000 عميل") */
  document.querySelectorAll('.sec-head p, .why b, .stat b, [data-count]').forEach(el => { const tn = [...el.childNodes].find(n => n.nodeType === 3 && /\d{2,}/.test(n.nodeValue)); if (!tn) return;
    const m = tn.nodeValue.match(/\d{2,}/), end = +m[0], pre = tn.nodeValue.slice(0, m.index), post = tn.nodeValue.slice(m.index + m[0].length), o = {v: 0};
    g.to(o, {v: end, duration: 1.8, ease: 'power2.out', scrollTrigger: {trigger: el, start: 'top 90%', once: true}, onUpdate: () => tn.nodeValue = pre + Math.round(o.v) + post}); });
  /* magnetic buttons (desktop) */
  if (FINE) document.querySelectorAll('.btn-main, .fx-btn, .cta, .f-wa').forEach(b => { const xt = g.quickTo(b, 'x', {duration: .5, ease: E}), yt = g.quickTo(b, 'y', {duration: .5, ease: E});
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); xt((e.clientX - r.left - r.width / 2) * .18); yt((e.clientY - r.top - r.height / 2) * .25); });
    b.addEventListener('pointerleave', () => { xt(0); yt(0); }); });
  /* products page: FLIP-ish animate re-rendered grid */
  const grid = document.getElementById('grid');
  if (grid) new MutationObserver(() => { const k = [...grid.children]; k.forEach(c => c.dataset.rv = ''); g.fromTo(k, {opacity: 0, y: 20, scale: .98}, {opacity: 1, y: 0, scale: 1, duration: .55, ease: E, stagger: .05, clearProps: 'transform'}); }).observe(grid, {childList: true});
  /* late-rendered content (product page builds DOM in JS) */
  new MutationObserver(() => reveal()).observe(document.querySelector('main') || document.body, {childList: true, subtree: true});
  addEventListener('load', () => ST.refresh());
  /* safety net: never leave content hidden */
  setTimeout(() => document.querySelectorAll('[data-rv]').forEach(e => { if (getComputedStyle(e).opacity === '0' && e.getBoundingClientRect().top < innerHeight) g.to(e, {opacity: 1, y: 0, duration: .4}); }), 4000);
})();
