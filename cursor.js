/* ============================================
   FUKU Coffee — Custom Cursor (ring + dot)
   Skipped on touch devices.
   ============================================ */
(function () {
  if (window.matchMedia('(hover: none)').matches) return;       // touch device
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const style = document.createElement('style');
  style.textContent = `
    html, body { cursor: none; }
    a, button, input, select, textarea, label,
    .product-card, .cat-card, .pc-add, .filter-chip,
    [role="button"], [tabindex]:not([tabindex="-1"]) { cursor: none; }

    .fuku-cursor-ring,
    .fuku-cursor-dot {
      position: fixed;
      top: 0; left: 0;
      pointer-events: none;
      z-index: 99999;
      will-change: transform;
    }
    .fuku-cursor-ring {
      width: 32px; height: 32px;
      border: 1.5px solid #1A0F2E;
      border-radius: 50%;
      transform: translate3d(-100px, -100px, 0) translate(-50%, -50%);
      transition:
        width  .25s cubic-bezier(.5,1.5,.5,1),
        height .25s cubic-bezier(.5,1.5,.5,1),
        background .25s ease,
        border-color .25s ease,
        opacity .2s;
      box-shadow:
        0 0 0 1px rgba(255,255,255,.55),
        0 2px 8px rgba(26,15,46,.12);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
    }
    .fuku-cursor-dot {
      width: 6px; height: 6px;
      background: #1A0F2E;
      border-radius: 50%;
      transform: translate3d(-100px, -100px, 0) translate(-50%, -50%);
      box-shadow: 0 0 0 1px rgba(255,255,255,.5);
      transition: width .2s, height .2s, opacity .2s;
    }

    /* Expanded over interactive elements */
    .fuku-cursor-ring.is-hover {
      width: 56px; height: 56px;
      background: rgba(74, 26, 142, 0.10);
      border-color: #4A1A8E;
    }
    .fuku-cursor-ring.is-press {
      width: 24px; height: 24px;
      background: rgba(74, 26, 142, 0.20);
    }
    .fuku-cursor-dot.is-hover { width: 4px; height: 4px; }

    /* On purple/dark sections invert via mix-blend */
    .fuku-cursor-ring.on-dark { border-color: #fff; }
    .fuku-cursor-dot.on-dark  { background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.3); }

    /* Hide while moving over inputs so it's not annoying when typing */
    .fuku-cursor-ring.text-mode,
    .fuku-cursor-dot.text-mode { opacity: 0; }
  `;
  document.head.appendChild(style);

  const ring = document.createElement('div');
  ring.className = 'fuku-cursor-ring';
  const dot = document.createElement('div');
  dot.className = 'fuku-cursor-dot';
  document.body.append(ring, dot);

  let mx = -100, my = -100;   // current mouse pos
  let rx = -100, ry = -100;   // ring follow pos (eased)

  // Live mouse → dot moves immediately
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform =
      `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`;
  }, { passive: true });

  // Ring follows with easing
  (function loop() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.transform =
      `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  })();

  // Hover / press / text states
  const HOVER_SEL = 'a, button, .pc-add, .product-card, .cat-card, .filter-chip, [role="button"], .ig-tile, .post, .rev-card';
  const TEXT_SEL  = 'input, textarea, select, [contenteditable="true"]';

  document.addEventListener('mouseover', e => {
    if (e.target.closest(TEXT_SEL)) {
      ring.classList.add('text-mode'); dot.classList.add('text-mode');
    }
    if (e.target.closest(HOVER_SEL)) {
      ring.classList.add('is-hover'); dot.classList.add('is-hover');
    }
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest(TEXT_SEL)) {
      ring.classList.remove('text-mode'); dot.classList.remove('text-mode');
    }
    if (e.target.closest(HOVER_SEL) &&
        !e.relatedTarget?.closest?.(HOVER_SEL)) {
      ring.classList.remove('is-hover'); dot.classList.remove('is-hover');
    }
  });

  document.addEventListener('mousedown', () => ring.classList.add('is-press'));
  document.addEventListener('mouseup',   () => ring.classList.remove('is-press'));

  // Detect dark sections to invert cursor colour
  const darkSelectors = ['.hero', '.brew', '.news', '.footer', '.story-art', '.announce', '.marquee', '.banner'];
  function checkDark() {
    const el = document.elementFromPoint(mx, my);
    if (!el) return;
    const dark = darkSelectors.some(sel => el.closest(sel));
    ring.classList.toggle('on-dark', dark);
    dot.classList.toggle('on-dark', dark);
  }
  let checkTick;
  document.addEventListener('mousemove', () => {
    if (checkTick) return;
    checkTick = setTimeout(() => { checkDark(); checkTick = null; }, 80);
  }, { passive: true });

  // Hide cursor when mouse leaves the viewport
  document.addEventListener('mouseleave', () => {
    ring.style.opacity = '0'; dot.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    ring.style.opacity = '1'; dot.style.opacity = '1';
  });
})();
