/* TikoBot — personnage visible et léger, intégré sans image lourde */
(() => {
  'use strict';

  const robotSvg = `
  <svg viewBox="0 0 220 250" role="img" aria-label="TikoBot" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="twChrome" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff"/><stop offset=".24" stop-color="#8f959d"/>
        <stop offset=".48" stop-color="#f7f8fa"/><stop offset=".72" stop-color="#5a6068"/>
        <stop offset="1" stop-color="#dfe3e8"/>
      </linearGradient>
      <linearGradient id="twRuby" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ff5c68"/><stop offset=".48" stop-color="#ba001e"/><stop offset="1" stop-color="#5d0010"/>
      </linearGradient>
      <filter id="twGlow"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <ellipse cx="110" cy="235" rx="67" ry="8" fill="rgba(0,0,0,.34)"/>
    <rect x="64" y="103" width="92" height="76" rx="31" fill="url(#twChrome)" stroke="#222830" stroke-width="4"/>
    <circle cx="74" cy="123" r="16" fill="url(#twRuby)" stroke="#d7dce1" stroke-width="5"/>
    <circle cx="146" cy="123" r="16" fill="url(#twRuby)" stroke="#d7dce1" stroke-width="5"/>
    <rect x="73" y="161" width="27" height="58" rx="13" fill="url(#twChrome)" stroke="#20242a" stroke-width="4"/>
    <rect x="120" y="161" width="27" height="58" rx="13" fill="url(#twChrome)" stroke="#20242a" stroke-width="4"/>
    <rect x="62" y="214" width="45" height="16" rx="8" fill="url(#twChrome)" stroke="#20242a" stroke-width="4"/>
    <rect x="113" y="214" width="45" height="16" rx="8" fill="url(#twChrome)" stroke="#20242a" stroke-width="4"/>
    <rect x="34" y="116" width="31" height="79" rx="15" fill="url(#twChrome)" stroke="#20242a" stroke-width="4" transform="rotate(8 49 155)"/>
    <rect x="155" y="116" width="31" height="79" rx="15" fill="url(#twChrome)" stroke="#20242a" stroke-width="4" transform="rotate(-8 170 155)"/>
    <rect x="34" y="18" width="152" height="102" rx="47" fill="url(#twChrome)" stroke="#24282e" stroke-width="5"/>
    <rect x="48" y="30" width="124" height="77" rx="31" fill="#07080a" stroke="#b8142f" stroke-width="4"/>
    <path d="M70 65 Q82 50 94 65" fill="none" stroke="#ff314c" stroke-width="8" stroke-linecap="round" filter="url(#twGlow)"/>
    <path d="M126 65 Q138 50 150 65" fill="none" stroke="#ff314c" stroke-width="8" stroke-linecap="round" filter="url(#twGlow)"/>
    <path d="M88 82 Q110 100 132 82" fill="none" stroke="#ff405a" stroke-width="8" stroke-linecap="round" filter="url(#twGlow)"/>
    <circle cx="110" cy="139" r="13" fill="url(#twRuby)" stroke="#f4f6f8" stroke-width="4"/>
    <path d="M110 128 l8 11 -8 11 -8-11z" fill="#ffffff" opacity=".9"/>
  </svg>`;

  function install() {
    const card = document.querySelector('.tikobot-card');
    if (card && !card.querySelector('.tikobot-character')) {
      const box = document.createElement('div');
      box.className = 'tikobot-character';
      box.innerHTML = robotSvg + '<span>TikoBot</span>';
      const head = card.querySelector('.tikobot-head');
      if (head) head.after(box); else card.prepend(box);
    }

    const fab = document.querySelector('#tikobotFab');
    if (fab && !fab.dataset.robotReady) {
      fab.dataset.robotReady = '1';
      fab.innerHTML = '<span class="tikobot-mini-face">◡</span><b>TikoBot</b>';
    }

    if (!document.querySelector('#tikobotVisualStyle')) {
      const style = document.createElement('style');
      style.id = 'tikobotVisualStyle';
      style.textContent = `
        .tikobot-character{display:flex;flex-direction:column;align-items:center;justify-content:center;margin:10px auto 4px;max-width:165px;filter:drop-shadow(0 12px 18px rgba(0,0,0,.28));animation:twRobotFloat 3.2s ease-in-out infinite}
        .tikobot-character svg{display:block;width:142px;height:auto;max-height:165px}
        .tikobot-character span{margin-top:-4px;color:#f4d47d;font:700 12px/1 sans-serif;letter-spacing:.08em;text-transform:uppercase}
        .tikobot-mini-face{display:grid!important;place-items:center!important;width:24px!important;height:24px!important;border-radius:50%!important;background:linear-gradient(145deg,#f7f8fa,#9198a0 48%,#fff 68%,#59616b)!important;color:#c80028!important;border:1px solid rgba(255,255,255,.45);font-size:17px!important;font-weight:900!important;line-height:1!important}
        @keyframes twRobotFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @media(max-height:690px){.tikobot-character svg{width:110px}.tikobot-character{margin:6px auto 0}}
      `;
      document.head.appendChild(style);
    }
  }

  const observer = new MutationObserver(install);
  const start = () => {
    install();
    observer.observe(document.body, {childList:true, subtree:true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
