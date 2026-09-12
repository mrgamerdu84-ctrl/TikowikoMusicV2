/* TikoBot — salutation contextuelle selon l'heure, sans modifier le design */
(() => {
  'use strict';

  let greetingTimer = null;
  let fadeTimer = null;

  function replyEl() {
    return document.querySelector('#tikobotReply');
  }

  function cancelGreeting() {
    if (greetingTimer) clearTimeout(greetingTimer);
    if (fadeTimer) clearTimeout(fadeTimer);
    greetingTimer = null;
    fadeTimer = null;
    const el = replyEl();
    if (el) {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }
  }

  function greetingForNow() {
    const hour = new Date().getHours();
    const evening = hour >= 18 || hour < 5;
    return evening
      ? { hello: 'Bonsoir 🌙', question: 'Qu’est-ce que tu veux écouter maintenant ?' }
      : { hello: 'Salut 👋', question: 'Qu’est-ce que tu veux écouter aujourd’hui ?' };
  }

  function showGreeting() {
    cancelGreeting();
    const el = replyEl();
    if (!el) return;

    const message = greetingForNow();
    el.style.transition = 'opacity .22s ease, transform .22s ease';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    el.textContent = message.hello;

    greetingTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-4px)';
      fadeTimer = setTimeout(() => {
        el.textContent = message.question;
        el.style.transform = 'translateY(4px)';
        requestAnimationFrame(() => {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        });
      }, 230);
    }, 1500);
  }

  function bind() {
    document.addEventListener('click', event => {
      if (event.target.closest('#tikobotFab')) {
        setTimeout(showGreeting, 0);
        return;
      }

      if (event.target.closest('#tikobotGo, #tikobotMic, #tikobotClose, .tikobot-result')) {
        cancelGreeting();
      }
    });

    document.addEventListener('input', event => {
      if (event.target && event.target.id === 'tikobotInput') cancelGreeting();
    });

    document.addEventListener('keydown', event => {
      if (event.target && event.target.id === 'tikobotInput' && event.key === 'Enter') cancelGreeting();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
