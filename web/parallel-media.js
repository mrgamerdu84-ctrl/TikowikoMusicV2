/* tikoWiko Musique — priorité stricte aux vraies vidéos/médias externes */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const A = window.Android || null;
  const POLICY_VERSION = '3';

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

  function enforceVideoPriority() {
    // Les jeux restent protégés par le moniteur Android, mais Netflix/YouTube/
    // lecteurs vidéo doivent toujours mettre TikowikoMusic en pause.
    localStorage.setItem('tw_external_video_policy_version', POLICY_VERSION);
    localStorage.setItem('tw_parallel_media', 'false');
    localStorage.setItem('tw_focus', 'pause');
    localStorage.removeItem('tw_parallel_prev_focus');
    safeCall('setFocusMode', 'pause');

    const chip = $('#focusChipText');
    if (chip) chip.textContent = 'Focus audio · vidéo prioritaire';
    const setVal = $('#setFocusVal');
    if (setVal) setVal.textContent = 'Pause vidéo';
  }

  function injectVideoPriorityCard() {
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
        <span class="tw-hearing-copy"><strong>Vidéo prioritaire</strong><small>Netflix et les vidéos mettent la musique en pause</small></span>
        <span class="tw-switch is-on" id="twParallelSwitch" role="switch" aria-checked="true"><i></i></span>
      </button>
      <div class="tw-hearing-info"><span>Lecture vidéo</span><small>Quand une vraie vidéo ou Netflix démarre, TikowikoMusic se met en pause automatiquement. La musique reprend ensuite quand la vidéo s'arrête. Les jeux restent traités séparément pour éviter les coupures.</small></div>`;

    if (hearing) hearing.after(card);
    else player.appendChild(card);

    $('#twParallelMain')?.addEventListener('click', () => {
      enforceVideoPriority();
      toast('Vidéo prioritaire activée');
    });
  }

  function keepPolicyLocked() {
    document.addEventListener('click', e => {
      if (e.target.closest('[data-focus], [data-profile]')) {
        setTimeout(enforceVideoPriority, 0);
      }
    }, true);
    document.addEventListener('visibilitychange', enforceVideoPriority, true);
  }

  function init() {
    enforceVideoPriority();
    injectVideoPriorityCard();
    keepPolicyLocked();
    const foot = $('.set-foot');
    if (foot) foot.innerHTML = 'tikoWiko Musique · Lecteur local Android<br>© 2026 tikoWikoFamily';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
