/* tikoWiko Musique 1.6.1 — garder la musique pendant les vidéos/autres médias */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const A = window.Android || null;

  let parallelMedia = JSON.parse(localStorage.getItem('tw_parallel_media') || 'true');

  function safeCall(name, ...args) {
    try { return A && typeof A[name] === 'function' ? A[name](...args) : null; }
    catch (_) { return null; }
  }

  function toast(text) {
    let el = $('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      ($('.phone-screen') || document.body).appendChild(el);
    }
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('is-on'), 1800);
  }

  function applyParallelMedia(announce = false) {
    localStorage.setItem('tw_parallel_media', JSON.stringify(parallelMedia));

    if (parallelMedia) {
      if (!localStorage.getItem('tw_parallel_prev_focus')) {
        localStorage.setItem('tw_parallel_prev_focus', localStorage.getItem('tw_focus') || 'pause');
      }
      localStorage.setItem('tw_focus', 'keep');
      localStorage.setItem('tw_focus_profile', 'jeu');
      localStorage.setItem('tw_background', 'true');
      safeCall('setFocusMode', 'keep');

      const chip = $('#focusChipText');
      if (chip) chip.textContent = 'Focus audio · lecture maintenue';
      const setVal = $('#setFocusVal');
      if (setVal) setVal.textContent = 'Continuer';
    } else {
      const previous = localStorage.getItem('tw_parallel_prev_focus') || 'pause';
      localStorage.setItem('tw_focus', previous);
      safeCall('setFocusMode', previous);
      localStorage.removeItem('tw_parallel_prev_focus');
    }

    renderParallelCard();
    if (announce) toast(parallelMedia ? 'La musique continuera avec les vidéos' : 'Lecture parallèle désactivée');
  }

  function renderParallelCard() {
    const card = $('#twParallelCard');
    if (!card) return;
    card.classList.toggle('is-on', parallelMedia);
    const sw = $('#twParallelSwitch');
    if (sw) {
      sw.classList.toggle('is-on', parallelMedia);
      sw.setAttribute('aria-checked', String(parallelMedia));
    }
    const state = $('#twParallelState');
    if (state) state.textContent = parallelMedia ? 'Actif · la musique reste en lecture' : 'Désactivé';
  }

  function injectParallelCard() {
    if ($('#twParallelCard')) return;
    const hearing = $('#twHearingCard');
    const player = $('.screen[data-screen="player"]');
    if (!player) return;

    const card = document.createElement('div');
    card.id = 'twParallelCard';
    card.className = 'tw-hearing-card tw-parallel-card';
    card.innerHTML = `
      <button class="tw-hearing-main" id="twParallelMain" type="button">
        <span class="tw-hearing-icon">▶</span>
        <span class="tw-hearing-copy"><strong>Vidéo + musique</strong><small id="twParallelState">Actif · la musique reste en lecture</small></span>
        <span class="tw-switch is-on" id="twParallelSwitch" role="switch" aria-checked="true"><i></i></span>
      </button>
      <div class="tw-hearing-info"><span>Lecture parallèle</span><small>Quand une autre application vidéo ou média demande le son, tikoWiko continue de jouer. Android ne fournit pas toujours le type de l’application : ce réglage s’applique donc globalement aux autres médias.</small></div>`;

    if (hearing) hearing.after(card);
    else player.appendChild(card);

    $('#twParallelMain')?.addEventListener('click', () => {
      parallelMedia = !parallelMedia;
      applyParallelMedia(true);
    });
    renderParallelCard();
  }

  function keepPolicyAfterFocusUi() {
    document.addEventListener('click', e => {
      if (!parallelMedia) return;
      if (e.target.closest('[data-focus], [data-profile]')) {
        setTimeout(() => applyParallelMedia(false), 0);
      }
    }, true);
  }

  function keepPlayingInBackground() {
    // L'ancien lecteur peut être réglé sur « pas d'arrière-plan ».
    // Quand la lecture parallèle est active, on bloque cette pause au passage vers une autre app.
    document.addEventListener('visibilitychange', e => {
      if (!parallelMedia || !document.hidden) return;
      localStorage.setItem('tw_background', 'true');
      safeCall('setFocusMode', 'keep');
      // Le gestionnaire historique est installé sans capture ; ici on passe avant lui.
      e.stopImmediatePropagation();
    }, true);
  }

  function init() {
    injectParallelCard();
    keepPolicyAfterFocusUi();
    keepPlayingInBackground();
    applyParallelMedia(false);
    const foot = $('.set-foot');
    if (foot) foot.innerHTML = 'tikoWiko Musique 1.6.1 · Lecteur local Android<br>© 2026 tikoWikoFamily';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
