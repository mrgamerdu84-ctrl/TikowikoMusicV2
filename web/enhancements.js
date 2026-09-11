/* tikoWiko Musique 1.6 — finitions, sélecteur rapide et compatibilité appareil auditif */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const A = window.Android || null;

  const finishes = {
    gold: {
      label: 'Or', rgb: '240,201,84', hi: '#FFF0BE', accent: '#F0C954', mid: '#D6A93A', deep: '#8A6418',
      grad: 'linear-gradient(180deg,#FFF6D6 0%,#F3CE5D 34%,#D2A436 66%,#8E6A1C 100%)',
      text: '#F6EBD2', muted: '#BFAC84', faint: '#8B7C5C'
    },
    diamond: {
      label: 'Diamant', rgb: '116,217,255', hi: '#F2FDFF', accent: '#74D9FF', mid: '#42B8E6', deep: '#236D8E',
      grad: 'linear-gradient(180deg,#FFFFFF 0%,#CFF5FF 28%,#74D9FF 62%,#2E86AA 100%)',
      text: '#F2FBFF', muted: '#B7D5E1', faint: '#7798A6'
    },
    ruby: {
      label: 'Rubis', rgb: '230,56,85', hi: '#FFE4E9', accent: '#E63855', mid: '#B82340', deep: '#651427',
      grad: 'linear-gradient(180deg,#FFE6EA 0%,#FF6B83 30%,#D92F4E 64%,#72142B 100%)',
      text: '#FFF0F3', muted: '#D8A8B1', faint: '#94626D'
    },
    chrome: {
      label: 'Chrome', rgb: '198,207,220', hi: '#FFFFFF', accent: '#C6CFDC', mid: '#929DAA', deep: '#525B66',
      grad: 'linear-gradient(180deg,#FFFFFF 0%,#DCE2EA 28%,#AAB4C0 60%,#636E7A 100%)',
      text: '#F5F7FA', muted: '#BAC1CA', faint: '#777F89'
    },
    matte: {
      label: 'Mat', rgb: '171,161,147', hi: '#EEE9E2', accent: '#ABA193', mid: '#81786D', deep: '#4D4842',
      grad: 'linear-gradient(180deg,#DDD6CD 0%,#B3AA9E 36%,#81786D 68%,#4D4842 100%)',
      text: '#ECE8E2', muted: '#B2AAA0', faint: '#7D756D'
    }
  };

  let finish = localStorage.getItem('tw_finish') || 'gold';
  let hearing = JSON.parse(localStorage.getItem('tw_hearing') || 'false');
  let pickerSongs = [];

  function safeCall(name, ...args) {
    try { return A && typeof A[name] === 'function' ? A[name](...args) : null; }
    catch (_) { return null; }
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function fmt(ms) {
    const n = Math.max(0, Number(ms) || 0), sec = Math.floor(n / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
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

  function applyFinish(key, announce = false) {
    if (!finishes[key]) key = 'gold';
    finish = key;
    localStorage.setItem('tw_finish', key);
    const p = finishes[key];
    const root = $('.phone-screen') || document.documentElement;
    root.dataset.finish = key;
    root.style.setProperty('--tw-rgb', p.rgb);
    root.style.setProperty('--gold-hi', p.hi);
    root.style.setProperty('--gold', p.accent);
    root.style.setProperty('--gold-mid', p.mid);
    root.style.setProperty('--gold-deep', p.deep);
    root.style.setProperty('--gold-grad', p.grad);
    root.style.setProperty('--gold-line', `linear-gradient(90deg,rgba(${p.rgb},0) 0%,rgba(${p.rgb},.78) 50%,rgba(${p.rgb},0) 100%)`);
    root.style.setProperty('--border', `rgba(${p.rgb},.20)`);
    root.style.setProperty('--border-2', `rgba(${p.rgb},.42)`);
    root.style.setProperty('--text', p.text);
    root.style.setProperty('--muted', p.muted);
    root.style.setProperty('--faint', p.faint);
    root.style.setProperty('--glow', `0 0 32px rgba(${p.rgb},.20)`);
    $$('[data-finish-choice]').forEach(b => {
      const on = b.dataset.finishChoice === key;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (announce) toast(`Finition ${p.label}`);
  }

  function injectFinishes() {
    const modeRow = $('#modeRow');
    if (!modeRow || $('#twFinishBlock')) return;
    const block = document.createElement('div');
    block.id = 'twFinishBlock';
    block.className = 'tw-finish-block';
    block.innerHTML = `
      <div class="tw-sub-label">Couleurs & finitions</div>
      <div class="tw-finish-row">
        ${Object.entries(finishes).map(([k,p]) => `<button class="tw-finish" data-finish-choice="${k}" aria-pressed="false"><span class="tw-swatch tw-swatch-${k}"></span><span>${p.label}</span></button>`).join('')}
      </div>`;
    modeRow.parentElement.insertBefore(block, modeRow);
    $$('[data-finish-choice]', block).forEach(b => b.addEventListener('click', () => applyFinish(b.dataset.finishChoice, true)));
    applyFinish(finish);
  }

  function loadPickerSongs() {
    if (!A) return [];
    if (!safeCall('hasAudioPermission')) return [];
    try { return JSON.parse(safeCall('getSongs') || '[]'); }
    catch (_) { return []; }
  }

  function renderPicker(query = '') {
    const host = $('#twSongList');
    if (!host) return;
    const q = query.trim().toLowerCase();
    pickerSongs = loadPickerSongs();
    const rows = pickerSongs.map((s, i) => ({s, i})).filter(({s}) => !q || [s.title,s.artist,s.album].join(' ').toLowerCase().includes(q));
    $('#twSongCount').textContent = `${pickerSongs.length} titre${pickerSongs.length === 1 ? '' : 's'}`;
    if (!safeCall('hasAudioPermission')) {
      host.innerHTML = '<div class="tw-picker-empty"><strong>Accès à la musique nécessaire</strong><span>Autorise l’application à lire les fichiers audio du téléphone.</span><button id="twGrant">Autoriser</button></div>';
      $('#twGrant')?.addEventListener('click', () => safeCall('requestAudioPermission'));
      return;
    }
    if (!rows.length) {
      host.innerHTML = `<div class="tw-picker-empty"><strong>${pickerSongs.length ? 'Aucun résultat' : 'Aucune musique trouvée'}</strong><span>${pickerSongs.length ? 'Essaie un autre mot.' : 'Ajoute des fichiers audio sur ton téléphone.'}</span></div>`;
      return;
    }
    host.innerHTML = rows.slice(0, 250).map(({s,i}) => `<button class="tw-song-row" data-tw-track="${i}"><span class="tw-song-note">♫</span><span class="tw-song-text"><strong>${esc(s.title || 'Sans titre')}</strong><small>${esc(s.artist || 'Artiste inconnu')}</small></span><span class="tw-song-dur">${fmt(s.duration)}</span></button>`).join('');
    $$('[data-tw-track]', host).forEach(b => b.addEventListener('click', () => playFromPicker(Number(b.dataset.twTrack))));
  }

  function playFromPicker(i) {
    const titleChip = $('#libViews [data-view="titres"]');
    if (titleChip && !titleChip.classList.contains('is-on')) titleChip.click();
    requestAnimationFrame(() => {
      const row = $(`#libList [data-track="${i}"]`);
      if (row) row.click();
      else {
        const s = pickerSongs[i];
        if (s) safeCall('play', s.uri, s.title || 'Sans titre', s.artist || 'Artiste inconnu');
      }
      closePicker();
    });
  }

  function openPicker() {
    const sheet = $('#twSongSheet');
    if (!sheet) return;
    sheet.hidden = false;
    renderPicker($('#twPickerSearch')?.value || '');
    setTimeout(() => $('#twPickerSearch')?.focus(), 40);
  }

  function closePicker() {
    const sheet = $('#twSongSheet');
    if (sheet) sheet.hidden = true;
  }

  function injectPicker() {
    if ($('#twSongPickerBtn')) return;
    const screen = $('.screen[data-screen="player"]');
    if (!screen) return;
    const anchor = screen.querySelector('.focus-chip') || screen.querySelector('.modes');
    const button = document.createElement('button');
    button.id = 'twSongPickerBtn';
    button.className = 'tw-picker-btn';
    button.innerHTML = '<span class="tw-picker-icon">♫</span><span><strong>Choisir une chanson</strong><small>Sans quitter le lecteur</small></span><b>›</b>';
    if (anchor) anchor.after(button); else screen.appendChild(button);
    button.addEventListener('click', openPicker);

    const sheet = document.createElement('div');
    sheet.id = 'twSongSheet';
    sheet.className = 'tw-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="tw-sheet-card" role="dialog" aria-modal="true" aria-label="Choisir une chanson">
        <div class="tw-sheet-grip"></div>
        <div class="tw-sheet-head"><div><strong>Mes chansons</strong><span id="twSongCount">0 titre</span></div><button id="twPickerClose" aria-label="Fermer">×</button></div>
        <label class="tw-picker-search"><span>⌕</span><input id="twPickerSearch" type="search" placeholder="Titre, artiste ou album" autocomplete="off" /></label>
        <div id="twSongList" class="tw-song-list"></div>
      </div>`;
    ($('.phone-screen') || document.body).appendChild(sheet);
    $('#twPickerClose').addEventListener('click', closePicker);
    sheet.addEventListener('click', e => { if (e.target === sheet) closePicker(); });
    $('#twPickerSearch').addEventListener('input', e => renderPicker(e.target.value));
  }

  function audioOutputLabel() {
    let outs = [];
    try { outs = JSON.parse(safeCall('getAudioOutputs') || '[]'); } catch (_) {}
    const aid = outs.find(o => /audit|hearing|bluetooth/i.test(`${o.name || ''} ${o.type || ''}`));
    return aid ? `${aid.name} · ${aid.type}` : 'Sortie gérée automatiquement par Android';
  }

  function setHearingMode(on, announce = true) {
    hearing = !!on;
    localStorage.setItem('tw_hearing', JSON.stringify(hearing));
    if (hearing) {
      const currentMode = localStorage.getItem('tw_audio_mode') || 'classic';
      if (currentMode !== 'night') localStorage.setItem('tw_hearing_prev_mode', currentMode);
      safeCall('setAudioMode', 'night');
      safeCall('setNormalization', false);
    } else {
      const restore = localStorage.getItem('tw_hearing_prev_mode') || localStorage.getItem('tw_audio_mode') || 'classic';
      safeCall('setAudioMode', restore === 'night' ? 'classic' : restore);
      const norm = JSON.parse(localStorage.getItem('tw_normalize') || 'true');
      safeCall('setNormalization', norm);
    }
    renderHearing();
    if (announce) toast(hearing ? 'Mode appareil auditif activé' : 'Mode appareil auditif désactivé');
  }

  function renderHearing() {
    const card = $('#twHearingCard');
    if (!card) return;
    card.classList.toggle('is-on', hearing);
    const sw = $('#twHearingSwitch');
    sw.classList.toggle('is-on', hearing);
    sw.setAttribute('aria-checked', String(hearing));
    $('#twHearingState').textContent = hearing ? 'Actif · profil doux' : 'Désactivé';
    $('#twHearingOutput').textContent = audioOutputLabel();
  }

  function injectHearing() {
    if ($('#twHearingCard')) return;
    const picker = $('#twSongPickerBtn');
    const screen = $('.screen[data-screen="player"]');
    if (!screen) return;
    const card = document.createElement('div');
    card.id = 'twHearingCard';
    card.className = 'tw-hearing-card';
    card.innerHTML = `
      <button class="tw-hearing-main" id="twHearingMain">
        <span class="tw-hearing-icon">◉</span>
        <span class="tw-hearing-copy"><strong>Adaptation appareil auditif</strong><small id="twHearingState">Désactivé</small></span>
        <span class="tw-switch" id="twHearingSwitch" role="switch" aria-checked="false"><i></i></span>
      </button>
      <div class="tw-hearing-info"><span id="twHearingOutput">Sortie gérée automatiquement par Android</span><small>Profil doux : mode Nuit + normalisation désactivée. Le volume système reste sous ton contrôle.</small></div>`;
    if (picker) picker.after(card); else screen.appendChild(card);
    $('#twHearingMain').addEventListener('click', () => setHearingMode(!hearing));
    renderHearing();

    $('#modeRow')?.addEventListener('click', e => {
      if (e.target.closest('[data-mode]') && hearing) {
        hearing = false;
        localStorage.setItem('tw_hearing', 'false');
        setTimeout(renderHearing, 0);
      }
    });
  }

  function fixModeButtons() {
    $$('#modeRow .mode').forEach(b => {
      b.type = 'button';
      b.classList.add('tw-mode-fixed');
    });
  }

  function init() {
    injectPicker();
    injectHearing();
    injectFinishes();
    fixModeButtons();
    const mr = $('#modeRow');
    if (mr) new MutationObserver(() => { fixModeButtons(); injectFinishes(); }).observe(mr, {childList:true});
    if (hearing) setHearingMode(true, false);
    const foot = $('.set-foot');
    if (foot) foot.innerHTML = 'tikoWiko Musique 1.6 · Lecteur local Android<br>© 2026 tikoWikoFamily';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
