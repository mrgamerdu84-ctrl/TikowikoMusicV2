/* tikoWiko Musique — lecture strictement par dossier physique, sans changer le design */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const A = window.Android || null;

  let songs = [];
  let activeFolder = '';
  let folderIndices = [];
  let currentFolderPos = -1;
  let lastFolder = null;
  let syncing = false;
  let originalEnded = null;

  function safeCall(name, ...args) {
    try { return A && typeof A[name] === 'function' ? A[name](...args) : null; }
    catch (_) { return null; }
  }

  function folderKey(raw) {
    return String(raw || 'Musique')
      .replace(/\\/g, '/')
      .replace(/\/+$/g, '')
      .replace(/^\/+/, '') || 'Musique';
  }

  function readSongs() {
    if (!A || !safeCall('hasAudioPermission')) {
      songs = [];
      return;
    }
    try { songs = JSON.parse(safeCall('getSongs') || '[]'); }
    catch (_) { songs = []; }
    songs.forEach(s => { s.folder = folderKey(s.folder); });
  }

  function physicalFolders() {
    return [...new Set(songs.map(s => folderKey(s.folder)))].sort((a, b) => a.localeCompare(b, 'fr'));
  }

  function resolveCurrentPos() {
    if (!folderIndices.length) {
      currentFolderPos = -1;
      return;
    }
    try {
      const state = JSON.parse(safeCall('getPlaybackState') || '{}');
      const title = String(state.title || '');
      const artist = String(state.artist || '');
      const found = folderIndices.findIndex(i => {
        const s = songs[i];
        return s && String(s.title || '') === title && String(s.artist || '') === artist;
      });
      if (found >= 0) currentFolderPos = found;
    } catch (_) {}
    if (currentFolderPos < 0 || currentFolderPos >= folderIndices.length) currentFolderPos = 0;
  }

  function rebuildFolder() {
    readSongs();
    const folders = physicalFolders();
    activeFolder = folderKey(localStorage.getItem('tw_active_folder') || '');
    if (!localStorage.getItem('tw_active_folder')) activeFolder = '';

    // Une seule source : on l'utilise directement. Avec plusieurs dossiers,
    // aucune liste globale mélangée n'est autorisée : il faut en choisir un.
    if (!activeFolder && folders.length === 1) {
      activeFolder = folders[0];
      localStorage.setItem('tw_active_folder', activeFolder);
    }

    if (activeFolder && !folders.includes(activeFolder)) {
      activeFolder = '';
      localStorage.removeItem('tw_active_folder');
    }

    folderIndices = activeFolder
      ? songs.map((s, i) => ({s, i})).filter(x => folderKey(x.s.folder) === activeFolder).map(x => x.i)
      : [];
    resolveCurrentPos();
  }

  function removeMixedChoice() {
    const all = $('#twFolderList [data-tw-folder=""]');
    if (all) all.remove();
  }

  function enforceLibrary() {
    const list = $('#libList');
    if (!list) return;
    const allowed = new Set(folderIndices);
    const rows = $$('[data-track]', list);

    if (!activeFolder) {
      rows.forEach(row => { row.hidden = true; });
      const count = $('#libCount');
      if (count) count.textContent = songs.length ? 'Choisis un dossier' : '0 titre';
      const code = $('.screen[data-screen="library"] .scan code');
      if (code && songs.length) code.textContent = 'Choisir un dossier';
      return;
    }

    let visible = 0;
    rows.forEach(row => {
      const idx = Number(row.dataset.track);
      const keep = allowed.has(idx);
      row.hidden = !keep;
      if (keep) visible++;
    });
    const count = $('#libCount');
    if (count) count.textContent = `${visible} titre${visible !== 1 ? 's' : ''}`;
  }

  function enforceQueue() {
    const list = $('#queueList');
    if (!list || !activeFolder) return;
    const allowed = new Set(folderIndices);
    let visible = 0;
    $$('[data-q]', list).forEach(row => {
      const idx = Number(row.dataset.q);
      const keep = allowed.has(idx);
      row.hidden = !keep;
      if (keep) visible++;
    });
    const label = $('.screen[data-screen="queue"] .q-label');
    if (label) label.textContent = `À suivre — ${visible} titre${visible !== 1 ? 's' : ''} dans ce dossier`;
  }

  function clearSearchAndForceTitles(done) {
    const input = $('#searchInput');
    if (input && input.value) {
      input.value = '';
      input.dispatchEvent(new Event('input', {bubbles:true}));
    }
    const titleChip = $('#libViews [data-view="titres"]');
    if (titleChip && !titleChip.classList.contains('is-on')) titleChip.click();
    requestAnimationFrame(done);
  }

  function playBaseIndex(baseIndex) {
    if (!songs[baseIndex]) return;
    const pos = folderIndices.indexOf(baseIndex);
    if (pos >= 0) currentFolderPos = pos;

    clearSearchAndForceTitles(() => {
      const row = $(`#libList [data-track="${baseIndex}"]`);
      if (row) {
        row.hidden = false;
        row.click();
        requestAnimationFrame(() => {
          enforceLibrary();
          enforceQueue();
        });
      }
    });
  }

  function strictNext(fromEnd = false) {
    rebuildFolder();
    if (!activeFolder || !folderIndices.length) return;

    const repeat = localStorage.getItem('tw_repeat') || 'off';
    const shuffle = JSON.parse(localStorage.getItem('tw_shuffle') || 'false');
    resolveCurrentPos();

    if (fromEnd && repeat === 'one') {
      playBaseIndex(folderIndices[currentFolderPos]);
      return;
    }

    let nextPos = currentFolderPos;
    if (shuffle && folderIndices.length > 1) {
      do { nextPos = Math.floor(Math.random() * folderIndices.length); }
      while (nextPos === currentFolderPos);
    } else {
      nextPos += 1;
      if (nextPos >= folderIndices.length) {
        if (repeat === 'all') nextPos = 0;
        else return;
      }
    }
    playBaseIndex(folderIndices[nextPos]);
  }

  function strictPrevious() {
    rebuildFolder();
    if (!activeFolder || !folderIndices.length) return;

    try {
      const state = JSON.parse(safeCall('getPlaybackState') || '{}');
      if ((Number(state.position) || 0) > 4000) {
        safeCall('seekTo', 0);
        return;
      }
    } catch (_) {}

    resolveCurrentPos();
    let prevPos = currentFolderPos - 1;
    if (prevPos < 0) prevPos = folderIndices.length - 1;
    playBaseIndex(folderIndices[prevPos]);
  }

  function openFolderChoice() {
    const scan = $('.screen[data-screen="library"] .scan');
    if (scan) scan.click();
  }

  function bindStrictControls() {
    document.addEventListener('click', e => {
      const row = e.target.closest('#libList [data-track]');
      if (row && activeFolder) {
        const idx = Number(row.dataset.track);
        const pos = folderIndices.indexOf(idx);
        if (pos < 0) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        currentFolderPos = pos;
      }

      const mode = e.target.closest('#libViews [data-view="albums"], #libViews [data-view="artistes"], #libViews [data-view="dossiers"]');
      if (mode && !activeFolder && songs.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openFolderChoice();
        return;
      }

      const buttons = $$('.controls .icon-btn');
      const btn = e.target.closest('.controls .icon-btn');
      if (!btn || !activeFolder || !folderIndices.length) return;
      const pos = buttons.indexOf(btn);
      if (pos === 1) {
        e.preventDefault();
        e.stopImmediatePropagation();
        strictPrevious();
      } else if (pos === 2) {
        e.preventDefault();
        e.stopImmediatePropagation();
        strictNext(false);
      }
    }, true);
  }

  function watchUi() {
    const observer = new MutationObserver(() => {
      if (syncing) return;
      syncing = true;
      requestAnimationFrame(() => {
        removeMixedChoice();
        enforceLibrary();
        enforceQueue();
        syncing = false;
      });
    });
    observer.observe(document.body, {childList:true, subtree:true});

    setInterval(() => {
      const stored = localStorage.getItem('tw_active_folder') || '';
      if (stored !== lastFolder) {
        lastFolder = stored;
        rebuildFolder();
        enforceLibrary();
        enforceQueue();
      }
      removeMixedChoice();
    }, 350);
  }

  function init() {
    rebuildFolder();
    lastFolder = localStorage.getItem('tw_active_folder') || '';
    bindStrictControls();
    watchUi();
    removeMixedChoice();
    enforceLibrary();
    enforceQueue();

    originalEnded = window.onNativeTrackEnded;
    window.onNativeTrackEnded = () => {
      rebuildFolder();
      if (activeFolder && folderIndices.length) strictNext(true);
      else if (typeof originalEnded === 'function') originalEnded();
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
