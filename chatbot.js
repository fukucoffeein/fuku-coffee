/* ============================================
   FUKU Coffee — Chatbot Widget
   ============================================ */

(function () {
  const SESSION_KEY = 'fuku_chat_session';
  let SESSION_ID = localStorage.getItem(SESSION_KEY);
  if (!SESSION_ID) {
    SESSION_ID = 'sess_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(SESSION_KEY, SESSION_ID);
  }

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    /* Floating action button — pill style with avatar + label */
    .chat-fab{
      position:fixed; bottom:24px; left:24px; z-index:90;
      display:inline-flex; align-items:center; gap:12px;
      padding:8px 22px 8px 8px;
      background:linear-gradient(135deg,#3B0B6E 0%,#5B2BAA 50%,#7B47C9 100%);
      color:#fff;
      border-radius:999px; border:none; cursor:pointer;
      box-shadow:
        0 14px 32px rgba(74,26,142,.45),
        0 4px 12px rgba(74,26,142,.25),
        inset 0 1px 0 rgba(255,255,255,.15);
      transition:transform .3s cubic-bezier(.5,1.5,.5,1), box-shadow .3s;
      animation:chat-fab-in .8s cubic-bezier(.5,1.6,.4,1) .8s both;
    }
    @keyframes chat-fab-in{
      from{transform:translateY(20px) scale(.5);opacity:0}
      to  {transform:translateY(0) scale(1);opacity:1}
    }
    .chat-fab:hover{
      transform:translateY(-3px) scale(1.04);
      box-shadow:0 22px 44px rgba(74,26,142,.55), 0 6px 16px rgba(74,26,142,.32);
    }
    .chat-fab-icon{
      width:44px; height:44px; border-radius:50%;
      background:rgba(255,255,255,.18);
      backdrop-filter:blur(8px);
      display:flex; align-items:center; justify-content:center;
      flex-shrink:0;
      position:relative;
      box-shadow:inset 0 0 0 2px rgba(255,255,255,.25);
    }
    .chat-fab-icon svg{width:24px;height:24px;color:#fff}
    .chat-fab-icon::after{
      content:''; position:absolute;
      bottom:0; right:0;
      width:11px; height:11px;
      background:#25D366;
      border-radius:50%;
      border:2px solid #5B2BAA;
      box-shadow:0 0 0 2px rgba(37,211,102,.4);
      animation:chat-online 2s ease-in-out infinite;
    }
    @keyframes chat-online{
      0%,100%{box-shadow:0 0 0 2px rgba(37,211,102,.4)}
      50%    {box-shadow:0 0 0 6px rgba(37,211,102,0)}
    }
    .chat-fab-text{
      display:flex; flex-direction:column;
      align-items:flex-start; line-height:1.15;
      font-family:'Inter',system-ui,sans-serif;
    }
    .chat-fab-text strong{
      font-size:14px; font-weight:700;
      letter-spacing:.01em;
    }
    .chat-fab-text small{
      font-size:11px; font-weight:500;
      opacity:.85;
      letter-spacing:.02em;
    }
    .chat-fab .chat-fab-badge{
      position:absolute; top:-4px; right:-4px;
      background:#FF3366; color:#fff;
      font-size:10px; font-weight:800;
      width:22px; height:22px;
      border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      border:2.5px solid #fff;
      box-shadow:0 4px 10px rgba(255,51,102,.5);
      animation:badge-bounce .6s cubic-bezier(.4,1.6,.5,1);
    }
    @keyframes badge-bounce{
      0%{transform:scale(0)} 60%{transform:scale(1.3)} 100%{transform:scale(1)}
    }
    .chat-fab::before{
      content:''; position:absolute; inset:-3px;
      border-radius:999px;
      background:linear-gradient(135deg,#7B47C9,#B697E0);
      opacity:.35; z-index:-1;
      animation:chatping 2.4s ease-out infinite;
    }
    @keyframes chatping{
      0%  {transform:scale(1);   opacity:.5}
      80% {transform:scale(1.18);opacity:0}
      100%{transform:scale(1.18);opacity:0}
    }

    /* Proactive teaser bubble — pops out from fab */
    .chat-teaser{
      position:fixed; bottom:96px; left:24px; z-index:91;
      max-width:280px;
      background:#fff;
      color:#1A0F2E;
      padding:14px 18px 14px 16px;
      border-radius:18px 18px 18px 4px;
      box-shadow:0 20px 50px rgba(42,8,87,.22), 0 4px 14px rgba(42,8,87,.12);
      font-family:'Inter',system-ui,sans-serif;
      font-size:13.5px; line-height:1.45;
      transform-origin:bottom left;
      animation:teaser-in .5s cubic-bezier(.4,1.5,.5,1) .2s both;
      cursor:pointer;
      border:1px solid #EFE6FA;
    }
    @keyframes teaser-in{
      from{transform:scale(.3) translateY(20px);opacity:0}
      to  {transform:scale(1)   translateY(0);  opacity:1}
    }
    .chat-teaser strong{ color:#4A1A8E; font-weight:700; }
    .chat-teaser-close{
      position:absolute; top:6px; right:8px;
      background:transparent; border:none; cursor:pointer;
      width:20px; height:20px;
      color:#6B5A85; font-size:14px;
      border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      transition:background .2s;
    }
    .chat-teaser-close:hover{ background:#F0EAF8; color:#1A0F2E; }
    .chat-teaser-avatar{
      display:inline-block;
      width:24px; height:24px;
      background:linear-gradient(135deg,#4A1A8E,#7B47C9);
      color:#fff;
      border-radius:50%;
      text-align:center; line-height:24px;
      font-family:'Fraunces',Georgia,serif;
      font-weight:900;
      font-size:14px;
      margin-right:6px;
      vertical-align:middle;
    }

    @media (max-width:480px){
      .chat-fab{ padding:8px 16px 8px 8px; bottom:18px; left:18px; }
      .chat-fab-text strong{ font-size:13px; }
      .chat-fab-text small{ display:none; }
      .chat-fab-icon{ width:38px; height:38px; }
      .chat-fab-icon svg{ width:20px; height:20px; }
      .chat-teaser{ max-width:calc(100vw - 50px); left:18px; bottom:82px; }
    }

    .chat-panel{position:fixed;bottom:96px;left:24px;width:380px;max-width:calc(100vw - 32px);height:580px;max-height:calc(100vh - 130px);background:#fff;border-radius:20px;box-shadow:0 24px 60px rgba(42,8,87,.28);z-index:95;display:flex;flex-direction:column;overflow:hidden;transform:translateY(20px) scale(.95);opacity:0;pointer-events:none;transition:all .3s cubic-bezier(.5,0,.25,1);font-family:'Inter',system-ui,sans-serif}
    .chat-panel.open{transform:translateY(0) scale(1);opacity:1;pointer-events:auto}

    .chat-head{background:linear-gradient(135deg,#3B0B6E,#5B2BAA);color:#fff;padding:18px 20px;display:flex;align-items:center;gap:14px;flex-shrink:0}
    .chat-avatar{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:20px;font-family:'Fraunces',Georgia,serif;font-weight:900}
    .chat-head-info{flex:1;display:flex;flex-direction:column;line-height:1.2}
    .chat-head-info strong{font-size:14px;font-weight:700}
    .chat-head-info span{font-size:11.5px;opacity:.85;display:flex;align-items:center;gap:5px}
    .chat-head-info .dot{width:7px;height:7px;border-radius:50%;background:#25D366;display:inline-block}
    .chat-close-btn{background:rgba(255,255,255,.15);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:14px;transition:background .2s}
    .chat-close-btn:hover{background:rgba(255,255,255,.25)}

    .chat-body{flex:1;overflow-y:auto;padding:18px 18px 10px;background:#FBF7F0;scroll-behavior:smooth}
    .chat-body::-webkit-scrollbar{width:6px}
    .chat-body::-webkit-scrollbar-thumb{background:#D7CCEB;border-radius:3px}

    .chat-msg{display:flex;margin-bottom:14px;animation:msgIn .3s ease}
    @keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    .chat-msg.bot{justify-content:flex-start}
    .chat-msg.user{justify-content:flex-end}
    .chat-bubble{max-width:78%;padding:10px 14px;border-radius:16px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}
    .chat-msg.bot .chat-bubble{background:#fff;color:#1A0F2E;border-bottom-left-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.04)}
    .chat-msg.user .chat-bubble{background:linear-gradient(135deg,#4A1A8E,#5B2BAA);color:#fff;border-bottom-right-radius:4px}
    .chat-bubble strong{font-weight:700}
    .chat-bubble em{font-style:italic;opacity:.85;font-size:12.5px}

    .chat-products{display:flex;gap:8px;overflow-x:auto;padding:4px 18px 14px;margin:-4px -18px 0;-webkit-overflow-scrolling:touch}
    .chat-products::-webkit-scrollbar{height:4px}
    .chat-prod-card{flex-shrink:0;width:160px;background:#fff;border:1px solid #E7DFF1;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:6px;cursor:pointer;transition:all .2s}
    .chat-prod-card:hover{border-color:#B697E0;transform:translateY(-2px);box-shadow:0 6px 16px rgba(42,8,87,.08)}
    .chat-prod-card .cp-name{font-size:12px;font-weight:600;color:#1A0F2E;line-height:1.3}
    .chat-prod-card .cp-price{font-size:13px;font-weight:700;color:#4A1A8E;font-family:'Fraunces',Georgia,serif}
    .chat-prod-card .cp-add{margin-top:auto;background:#1A0F2E;color:#fff;border:none;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:600;cursor:pointer;transition:background .2s}
    .chat-prod-card .cp-add:hover{background:#4A1A8E}

    .chat-quick{padding:6px 18px 14px;display:flex;flex-wrap:wrap;gap:6px;background:#FBF7F0;flex-shrink:0;border-top:1px solid #F0E6F8}
    .chat-quick button{background:#fff;border:1.5px solid #E7DFF1;color:#4A1A8E;font-size:11.5px;font-weight:600;padding:7px 12px;border-radius:999px;cursor:pointer;transition:all .2s}
    .chat-quick button:hover{background:#4A1A8E;color:#fff;border-color:#4A1A8E}

    .chat-input-bar{padding:12px 18px 14px;background:#fff;display:flex;gap:8px;align-items:center;border-top:1px solid #E7DFF1;flex-shrink:0}
    .chat-input-bar input{flex:1;border:1.5px solid #E7DFF1;outline:none;padding:11px 16px;border-radius:999px;font-size:13.5px;color:#1A0F2E;transition:border-color .2s;background:#FBF7F0}
    .chat-input-bar input:focus{border-color:#4A1A8E;background:#fff}
    .chat-input-bar .send-btn{width:38px;height:38px;background:linear-gradient(135deg,#4A1A8E,#5B2BAA);color:#fff;border:none;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .2s}
    .chat-input-bar .send-btn:hover{transform:scale(1.08)}
    .chat-input-bar .send-btn svg{width:16px;height:16px}

    .chat-typing{display:inline-flex;gap:4px;padding:10px 14px;background:#fff;border-radius:16px;border-bottom-left-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.04)}
    .chat-typing span{width:6px;height:6px;background:#B697E0;border-radius:50%;animation:typing 1.2s infinite}
    .chat-typing span:nth-child(2){animation-delay:.2s}
    .chat-typing span:nth-child(3){animation-delay:.4s}
    @keyframes typing{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}

    @media (max-width: 480px){
      .chat-panel{left:8px;right:8px;width:auto;bottom:88px;height:calc(100vh - 110px)}
      .chat-fab{left:16px;bottom:16px}
    }
  `;
  document.head.appendChild(style);

  // Build markup
  const fab = document.createElement('button');
  fab.className = 'chat-fab';
  fab.setAttribute('aria-label', 'Chat with us');
  fab.innerHTML = `
    <span class="chat-fab-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8 8 0 0 1-12.2 6.8L3 20l1.2-5.8A8 8 0 1 1 21 12Z"/><circle cx="8.5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="15.5" cy="12" r="1" fill="currentColor"/></svg>
    </span>
    <span class="chat-fab-text">
      <strong>Chat with FUKU</strong>
      <small>We reply instantly ☕</small>
    </span>
    <span class="chat-fab-badge" id="chatFabBadge" style="display:none">1</span>
  `;
  document.body.appendChild(fab);

  // Proactive teaser
  let teaserEl = null;
  function showTeaser() {
    if (teaserEl || isOpen) return;
    if (sessionStorage.getItem('fuku_chat_teaser_dismissed_v2')) return;
    teaserEl = document.createElement('div');
    teaserEl.className = 'chat-teaser';
    teaserEl.innerHTML = `
      <button class="chat-teaser-close" aria-label="Close">×</button>
      <div><span class="chat-teaser-avatar">福</span><strong>Hey there!</strong></div>
      <div style="margin-top:4px">Need help picking a blend or placing an order? I'm right here ☕</div>
    `;
    document.body.appendChild(teaserEl);
    teaserEl.addEventListener('click', e => {
      if (e.target.classList.contains('chat-teaser-close')) {
        dismissTeaser(); return;
      }
      dismissTeaser();
      open();
    });
    setTimeout(() => { if (teaserEl) dismissTeaser(/*silent=*/true); }, 16000);
  }
  function dismissTeaser(silent) {
    if (teaserEl) { teaserEl.remove(); teaserEl = null; }
    if (!silent) sessionStorage.setItem('fuku_chat_teaser_dismissed_v2', '1');
  }

  const panel = document.createElement('aside');
  panel.className = 'chat-panel';
  panel.innerHTML = `
    <header class="chat-head">
      <div class="chat-avatar">福</div>
      <div class="chat-head-info">
        <strong>FUKU Assistant</strong>
        <span><span class="dot"></span> Online · Replies instantly</span>
      </div>
      <button class="chat-close-btn" id="chatCloseBtn" aria-label="Close">✕</button>
    </header>
    <div class="chat-body" id="chatBody"></div>
    <div class="chat-quick" id="chatQuick"></div>
    <form class="chat-input-bar" id="chatForm">
      <input type="text" id="chatInput" placeholder="Type a message..." autocomplete="off" />
      <button type="submit" class="send-btn" aria-label="Send">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21 23 12 2 3v7l15 2-15 2v7Z"/></svg>
      </button>
    </form>
  `;
  document.body.appendChild(panel);

  const body  = panel.querySelector('#chatBody');
  const quick = panel.querySelector('#chatQuick');
  const form  = panel.querySelector('#chatForm');
  const input = panel.querySelector('#chatInput');
  const badge = fab.querySelector('#chatFabBadge');

  let typingEl = null;
  let isOpen = false;
  let hasGreeted = false;

  function open() {
    panel.classList.add('open');
    isOpen = true;
    badge.style.display = 'none';
    if (teaserEl) dismissTeaser(true);
    input.focus();
    if (!hasGreeted) {
      hasGreeted = true;
      addBotMessage(
        "Hey! ☕ I'm the FUKU assistant. I can help you pick a blend, place an order, or answer questions about shipping, brewing, anything coffee.\n\nWhat brings you here today?",
        ['Recommend me a blend', 'Show best sellers', 'Shipping info', 'Show cold brew']
      );
    }
  }
  function close() { panel.classList.remove('open'); isOpen = false; }

  fab.addEventListener('click', () => isOpen ? close() : open());
  panel.querySelector('#chatCloseBtn').addEventListener('click', close);

  function addMessage(role, text, opts = {}) {
    if (typingEl) { typingEl.remove(); typingEl = null; }
    const div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.innerHTML = formatText(text);
    div.appendChild(bubble);
    body.appendChild(div);

    if (opts.products && opts.products.length) {
      const wrap = document.createElement('div');
      wrap.className = 'chat-products';
      opts.products.forEach(pid => {
        if (!window.__FUKU_PRODUCTS__) return;
        const p = window.__FUKU_PRODUCTS__.find(x => x.id === pid);
        if (!p) return;
        const card = document.createElement('div');
        card.className = 'chat-prod-card';
        card.innerHTML = `
          <span class="cp-name">${p.name}</span>
          <span class="cp-price">₹${p.price.toLocaleString('en-IN')}</span>
          <button class="cp-add" data-id="${p.id}">Add to cart</button>
        `;
        card.querySelector('.cp-add').addEventListener('click', () => {
          if (window.addToCart) window.addToCart(p.id);
          addBotMessage(`Added **${p.name}** to your cart. 🛒\n\nNeed anything else?`, ['Show more products', 'Checkout now', 'Free shipping?']);
        });
        wrap.appendChild(card);
      });
      body.appendChild(wrap);
    }

    body.scrollTop = body.scrollHeight;
  }

  function addUserMessage(text) { addMessage('user', text); }
  function addBotMessage(text, quickReplies = [], products = []) {
    addMessage('bot', text, { products });
    renderQuick(quickReplies);
  }

  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement('div');
    typingEl.className = 'chat-msg bot';
    typingEl.innerHTML = `<div class="chat-typing"><span></span><span></span><span></span></div>`;
    body.appendChild(typingEl);
    body.scrollTop = body.scrollHeight;
  }

  function renderQuick(replies) {
    quick.innerHTML = '';
    if (!replies || !replies.length) { quick.style.display = 'none'; return; }
    quick.style.display = 'flex';
    replies.forEach(r => {
      const b = document.createElement('button');
      b.textContent = r;
      b.addEventListener('click', () => handleUserInput(r));
      quick.appendChild(b);
    });
  }

  function formatText(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  }

  function handleQuickAction(action, text) {
    if (action === 'whatsapp') {
      const m = text.toLowerCase();
      if (m.includes('open whatsapp')) {
        window.open('https://wa.me/919574323011', '_blank');
        return true;
      }
    }
    return false;
  }

  async function handleUserInput(text) {
    if (!text || !text.trim()) return;
    text = text.trim();
    addUserMessage(text);
    renderQuick([]);

    // Quick action shortcuts
    if (/^add\s+(.+)/i.test(text) && window.__FUKU_PRODUCTS__) {
      const target = text.replace(/^add\s+/i, '').toLowerCase();
      const match = window.__FUKU_PRODUCTS__.find(p =>
        p.name.toLowerCase().includes(target) || target.includes(p.short?.toLowerCase() || '')
      );
      if (match) {
        if (window.addToCart) window.addToCart(match.id);
        addBotMessage(`Done! Added **${match.name}** — ₹${match.price.toLocaleString('en-IN')}. 🛒\n\nWant to add another, or checkout now?`, ['Checkout on WhatsApp', 'Show more', 'View cart']);
        return;
      }
    }
    if (/checkout|view cart/i.test(text)) {
      if (window.openCart) window.openCart();
      addBotMessage("Opened your cart! Click *Checkout on WhatsApp* to send your order — we'll confirm in minutes.", []);
      return;
    }
    if (/open whatsapp/i.test(text)) {
      window.open('https://wa.me/919574323011', '_blank');
      addBotMessage("Opened WhatsApp for you. We'll see your message right away. ✓", []);
      return;
    }

    showTyping();
    try {
      const cartTotal = window.cartTotal ? window.cartTotal() : 0;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: SESSION_ID, cart_total: cartTotal }),
      });
      const data = await res.json();
      setTimeout(() => {
        if (handleQuickAction(data.action, text)) return;
        addBotMessage(data.text, data.quick_replies, data.products);
      }, 400 + Math.random() * 400);
    } catch (e) {
      setTimeout(() => {
        addBotMessage("Connection hiccup. For now, message us directly:", ['Open WhatsApp']);
      }, 400);
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    handleUserInput(v);
  });

  // Proactive nudge — teaser bubble + badge
  if (!sessionStorage.getItem('fuku_chat_nudged_v2')) {
    setTimeout(() => {
      if (!isOpen) {
        showTeaser();
        badge.style.display = 'flex';
        sessionStorage.setItem('fuku_chat_nudged_v2', '1');
      }
    }, 4500);
  }
})();
