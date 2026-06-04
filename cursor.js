/* ============================================
   FUKU Coffee — Coffee Bean Cursor
   Replaces the default OS pointer with a
   hand-painted coffee-bean shape + eased trail.
   Skipped on touch/stylus devices automatically.
   ============================================ */
(function () {
  if (window.matchMedia('(hover: none)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // ── Coffee bean SVG (two halves + centre crease) ──────────────────────
  const BEAN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
  <defs>
    <radialGradient id="bg" cx="40%" cy="35%" r="65%">
      <stop offset="0%"  stop-color="#6B3A28"/>
      <stop offset="100%" stop-color="#2A1208"/>
    </radialGradient>
  </defs>
  <!-- Bean body -->
  <ellipse cx="14" cy="18" rx="11" ry="15.5" fill="url(#bg)"/>
  <!-- Highlight -->
  <ellipse cx="10" cy="11" rx="3.5" ry="2.5" fill="rgba(255,255,255,0.12)" transform="rotate(-20,10,11)"/>
  <!-- Centre crease -->
  <path d="M14 4 C10 9 9 15 10 20 C11 25 13 28 14 32
           C15 28 17 25 18 20 C19 15 18 9 14 4Z"
        fill="rgba(0,0,0,0.28)"/>
  <path d="M14 5 C10.5 10 10 16 11 21 C12 26 13 29 14 32"
        stroke="rgba(255,255,255,0.09)" stroke-width="1.2" fill="none" stroke-linecap="round"/>
</svg>`;

  // Hover-state bean (slightly lighter, bigger)
  const BEAN_HOVER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
  <defs>
    <radialGradient id="bgh" cx="40%" cy="35%" r="65%">
      <stop offset="0%"  stop-color="#8B4E36"/>
      <stop offset="100%" stop-color="#3B1A10"/>
    </radialGradient>
  </defs>
  <ellipse cx="17" cy="22" rx="13" ry="19" fill="url(#bgh)"/>
  <ellipse cx="12" cy="13" rx="4" ry="3" fill="rgba(255,255,255,0.14)" transform="rotate(-20,12,13)"/>
  <path d="M17 5 C12 11 11 18 12 24 C13 30 15 34 17 40
           C19 34 21 30 22 24 C23 18 22 11 17 5Z"
        fill="rgba(0,0,0,0.25)"/>
  <path d="M17 6 C13 12 12 19 13 25 C14 31 16 35 17 40"
        stroke="rgba(255,255,255,0.1)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
</svg>`;

  const toDataURL = svg =>
    'url("data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg.trim()))) + '")';

  const style = document.createElement('style');
  style.textContent = `
    html, body { cursor: none; }
    a, button, input, select, textarea, label,
    .product-card, .cat-card, .pc-add, .filter-chip,
    [role="button"], [tabindex]:not([tabindex="-1"]) { cursor: none; }

    /* Eased bean (trails behind) */
    .fuku-bean {
      position: fixed;
      top: 0; left: 0;
      width: 28px; height: 36px;
      pointer-events: none;
      z-index: 99999;
      will-change: transform;
      transform: translate3d(-100px,-100px,0) translate(-50%,-60%);
      transition: width .22s, height .22s, opacity .2s;
      filter: drop-shadow(0 2px 6px rgba(42,18,8,0.45));
    }
    .fuku-bean img { width:100%; height:100%; display:block; }

    /* Tiny precise dot (instant) */
    .fuku-dot {
      position: fixed;
      top: 0; left: 0;
      width: 5px; height: 5px;
      background: #C97A3E;
      border-radius: 50%;
      pointer-events: none;
      z-index: 100000;
      will-change: transform;
      transform: translate3d(-100px,-100px,0) translate(-50%,-50%);
      box-shadow: 0 0 0 1.5px rgba(255,255,255,0.7);
      transition: opacity .2s, width .2s, height .2s;
    }

    /* Hover state */
    .fuku-bean.is-hover { width:34px; height:44px; filter:drop-shadow(0 4px 10px rgba(42,18,8,0.55)); }
    .fuku-dot.is-hover  { width:7px; height:7px; background:#E8A060; }

    /* Click pulse */
    .fuku-bean.is-press { filter:drop-shadow(0 1px 3px rgba(42,18,8,0.3)) brightness(1.2); }

    /* On dark backgrounds */
    .fuku-bean.on-dark { filter:drop-shadow(0 2px 8px rgba(0,0,0,0.6)) brightness(1.25); }

    /* Text inputs — hide bean, show normal caret */
    .fuku-bean.text-mode, .fuku-dot.text-mode { opacity:0; }
  `;
  document.head.appendChild(style);

  // Build DOM elements
  const bean = document.createElement('div');
  bean.className = 'fuku-bean';
  const beanImg = document.createElement('img');
  beanImg.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(BEAN_SVG.trim())));
  beanImg.setAttribute('aria-hidden', 'true');
  bean.appendChild(beanImg);

  const dot = document.createElement('div');
  dot.className = 'fuku-dot';

  document.body.append(bean, dot);

  let mx = -100, my = -100;
  let bx = -100, by = -100;

  // Dot: instant follow
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate3d(${mx}px,${my}px,0) translate(-50%,-50%)`;
  }, { passive: true });

  // Bean: eased follow
  (function loop() {
    bx += (mx - bx) * 0.16;
    by += (my - by) * 0.16;
    bean.style.transform = `translate3d(${bx}px,${by}px,0) translate(-50%,-60%)`;
    requestAnimationFrame(loop);
  })();

  // Hover, text, press selectors
  const HOVER_SEL = 'a,button,.pc-add,.product-card,.cat-card,.filter-chip,[role="button"],.ig-tile,.sub-btn,.btn,.wa-float,.chat-fab';
  const TEXT_SEL  = 'input,textarea,select,[contenteditable="true"]';

  document.addEventListener('mouseover', e => {
    if (e.target.closest(TEXT_SEL)) { bean.classList.add('text-mode'); dot.classList.add('text-mode'); }
    if (e.target.closest(HOVER_SEL)) {
      bean.classList.add('is-hover'); dot.classList.add('is-hover');
      beanImg.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(BEAN_HOVER_SVG.trim())));
    }
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest(TEXT_SEL) && !e.relatedTarget?.closest?.(TEXT_SEL)) {
      bean.classList.remove('text-mode'); dot.classList.remove('text-mode');
    }
    if (e.target.closest(HOVER_SEL) && !e.relatedTarget?.closest?.(HOVER_SEL)) {
      bean.classList.remove('is-hover'); dot.classList.remove('is-hover');
      beanImg.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(BEAN_SVG.trim())));
    }
  });

  document.addEventListener('mousedown', () => bean.classList.add('is-press'));
  document.addEventListener('mouseup',   () => bean.classList.remove('is-press'));

  // Dark-section inversion
  const DARK_SELS = ['.hero','.brew','.news','.footer','.story-art','.announce','.marquee'];
  let ckTimer;
  document.addEventListener('mousemove', () => {
    if (ckTimer) return;
    ckTimer = setTimeout(() => {
      const el = document.elementFromPoint(mx, my);
      const dark = el && DARK_SELS.some(s => el.closest(s));
      bean.classList.toggle('on-dark', !!dark);
      ckTimer = null;
    }, 80);
  }, { passive: true });

  // Hide when mouse leaves viewport
  document.addEventListener('mouseleave', () => { bean.style.opacity='0'; dot.style.opacity='0'; });
  document.addEventListener('mouseenter', () => { bean.style.opacity='1'; dot.style.opacity='1'; });
})();
