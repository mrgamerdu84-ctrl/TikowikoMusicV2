/* tikoWiko Musique — gestion vidéo/média externe comme la première TikowikoMusic */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const A = window.Android || null;

  /*
   * IMPORTANT : le comportement normal est maintenant celui de la première
   * TikowikoMusic : Netflix / vidéo / vrai lecteur média met la musique en pause,
   * puis la lecture reprend automatiquement quand le média externe s'arrête.
   *
   * L'ancien mode "Vidéo + musique" forçait focus=keep et empêchait précisément
   * cette détection. On le laisse disponible comme option volontaire, mais il est
   * désactivé par défaut et une migration coupe l'ancien réglage une seule fois.
   */
  const POLICY_VERSION = '2';
  const policyKey = 'tw_external_video_policy_version';
  const needsMigration = localStorage.getItem(policyKey) !== POLICY_VERSION;
  if (needsMigration) {
    localStorage.setItem('tw_parallel_media', 'false');
    localStorage.setItem('tw_focus', 'pause');
    localStorage.removeItem('tw_parallel_prev_focus');
    localStorage.setItem(policyKey, POLICY_VERSION);
  }

  let parallelMedia = JSON.parse(localStorage.getItem('tw_parallel_media') || 'false');

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
      // Comportement TikowikoMusic V1 : le moniteur Android gère les vraies
      // vidéos/médias externes et reprend ensuite automatiquement.
      localStorage.setItem('tw_focus', 'pause');
      safeCall('setFocusMode', 'pause');
      localStorage.removeItem('tw_parallel_prev_focus');

      const chip = $('#focusChipText');
      if (chip) chip.textContent = 'Focus audio · vidéo prioritaire';
      const setVal = $('#setFocusVal');
      if (setVal) setVal.textContent = 'Pause vidéo';
    }

    renderParallelCard();
    if (announce) {
      toast(parallelMedia
        ? 'La musique continuera avec les vidéos'
        : 'Netflix et les vidéos mettront la musique en pause');
    }
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
    if (state) {
      state.textContent = parallelMedia
        ? 'Actif · la musique reste en lecture'
        : 'Désactivé · pause automatique pour les vidéos';
    }
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
        <span class="tw-hearing-copy"><strong>Vidéo + musique</strong><small id="twParallelState">Désactivé · pause automatique pour les vidéos</small></span>
        <span class="tw-switch" id="twParallelSwitch" role="switch" aria-checked="false"><i></i></span>
      </button>
      <div class="tw-hearing-info"><span>Lecture parallèle</span><small>Désactivé par défaut : Netflix, les vidéos et les vrais lecteurs média mettent tikoWiko en pause, puis la musique reprend quand ils s'arrêtent. Active ce réglage uniquement si tu veux vraiment entendre les deux en même temps.</small></div>`;

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
    // Ce bloc ne s'applique que si l'utilisateur active volontairement
    // "Vidéo + musique". Sinon le moniteur Android V1 garde la priorité vidéo.
    document.addEventListener('visibilitychange', e => {
      if (!parallelMedia || !document.hidden) return;
      localStorage.setItem('tw_background', 'true');
      safeCall('setFocusMode', 'keep');
      e.stopImmediatePropagation();
    }, true);
  }

  function init() {
    injectParallelCard();
    keepPolicyAfterFocusUi();
    keepPlayingInBackground();
    applyParallelMedia(false);
    const foot = $('.set-foot');
    if (foot) foot.innerHTML = 'tikoWiko Musique · Lecteur local Android<br>© 2026 tikoWikoFamily';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
