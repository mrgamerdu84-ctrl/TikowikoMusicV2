/* TikowikoMusicV2 — dossiers physiques stricts + synchro du lecteur natif */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const A = window.Android || null;
  let songs = [];
  let activeFolder = '';
  let scheduled = false;

  const safeCall = (name, ...args) => {
    try { return A && typeof A[name] === 'function' ? A[name](...args) : null; }
    catch (_) { return null; }
  };

  const folderKey = raw => String(raw || 'Musique')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '') || 'Musique';

  function readSongs() {
    if (!A || !safeCall('hasAudioPermission')) {
      songs = [];
      return;
    }
    try { songs = JSON.parse(safeCall('getSongs') || '[]'); }
    catch (_) { songs = []; }
    songs.forEach((s, i) => {
      s._i = i;
      s.folder = folderKey(s.folder);
    });
    activeFolder = folderKey(localStorage.getItem('tw_active_folder') || '');
    if (!localStorage.getItem('tw_active_folder')) activeFolder = '';
    if (activeFolder && !songs.some(s => s.folder === activeFolder)) {
      activeFolder = '';
      localStorage.removeItem('tw_active_folder');
    }
  }

  function realFolders() {
    return [...new Set(songs.map(s => s.folder))]
      .sort((a, b) => a.localeCompare(b, 'fr', {sensitivity:'base'}));
  }

  function filterLibrary() {
    readSongs();
    const list = $('#libList');
    if (!list) return;
    const rows = $$('[data-track]', list);
    const count = $('#libCount');
    const code = $('.screen[data-screen="library"] .scan code');

    if (!activeFolder) {
      rows.forEach(row => { row.hidden = true; });
      if (count) count.textContent = songs.length ? 'Choisis un dossier' : '0 titre';
      if (code && songs.length) code.textContent = 'Choisir un dossier';
      return;
    }

    let visible = 0;
    rows.forEach(row => {
      const index = Number(row.dataset.track);
      const s = songs[index];
      const keep = !!s && folderKey(s.folder) === activeFolder;
      row.hidden = !keep;
      if (keep) visible++;
    });
    if (count) count.textContent = `${visible} titre${visible !== 1 ? 's' : ''}`;
    if (code) code.textContent = activeFolder;
  }

  function fixFolderSheet() {
    readSongs();
    const host = $('#twFolderList');
    if (!host) return;

    const mixed = host.querySelector('[data-tw-folder=""]');
    if (mixed) mixed.remove();

    const rows = $$('[data-tw-folder]', host)
      .filter(row => row.dataset.twFolder)
      .sort((a, b) => folderKey(a.dataset.twFolder)
        .localeCompare(folderKey(b.dataset.twFolder), 'fr', {sensitivity:'base'}));

    rows.forEach(row => {
      const folder = folderKey(row.dataset.twFolder);
      const title = row.querySelector('strong');
      const small = row.querySelector('small');
      if (title) title.textContent = folder;
      const n = songs.filter(s => s.folder === folder).length;
      if (small) small.textContent = `${n} titre${n !== 1 ? 's' : ''}`;
      host.appendChild(row);
    });

    const count = $('#twFolderCount');
    const folders = realFolders();
    if (count) count.textContent = `${folders.length} dossier${folders.length !== 1 ? 's' : ''}`;
  }

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fixFolderSheet();
      filterLibrary();
    });
  }

  function syncNowPlaying(uri, title, artist) {
    readSongs();
    const index = songs.findIndex(s => String(s.uri) === String(uri));
    if (index >= 0) {
      const s = songs[index];
      localStorage.setItem('tw_active_folder', s.folder);
      activeFolder = s.folder;
      const row = $(`#libList [data-track="${index}"]`);
      const img = row?.querySelector('img');
      const src = img?.getAttribute('src');
      if (src) {
        const cover = $('#coverImg');
        const mini = $('#miniCover');
        const np = $('#npCover');
        if (cover) cover.src = src;
        if (mini) mini.src = src;
        if (np) np.src = src;
      }
      $$('#libList .row').forEach(r => r.classList.toggle('is-playing', Number(r.dataset.track) === index));
    }

    if ($('#trackTitle')) $('#trackTitle').textContent = title || 'Sans titre';
    if ($('#trackArtist')) $('#trackArtist').textContent = artist || 'Artiste inconnu';
    if ($('#miniTitle')) $('#miniTitle').textContent = title || 'Sans titre';
    if ($('#npTitle')) $('#npTitle').textContent = title || 'Sans titre';
    if ($('#npArtist')) $('#npArtist').textContent = `${artist || 'Artiste inconnu'} · en cours`;
    scheduleRefresh();
  }

  document.addEventListener('click', e => {
    const folderRow = e.target.closest('#twFolderList [data-tw-folder]');
    if (folderRow && folderRow.dataset.twFolder) {
      localStorage.setItem('tw_active_folder', folderKey(folderRow.dataset.twFolder));
      setTimeout(scheduleRefresh, 0);
    }

    const btn = e.target.closest('.controls .icon-btn');
    if (!btn || !A) return;
    const buttons = $$('.controls .icon-btn');
    const pos = buttons.indexOf(btn);
    const label = String(btn.getAttribute('aria-label') || '').toLowerCase();
    const previous = label.includes('préc') || label.includes('preced') || pos === 1;
    const next = label.includes('suiv') || pos === 2;

    if (previous && typeof A.previous === 'function') {
      e.preventDefault();
      e.stopImmediatePropagation();
      A.previous();
    } else if (next && typeof A.next === 'function') {
      e.preventDefault();
      e.stopImmediatePropagation();
      A.next();
    }
  }, true);

  const observer = new MutationObserver(scheduleRefresh);
  if (document.body) observer.observe(document.body, {childList:true, subtree:true});

  // Le service Android avance déjà dans le vrai dossier, même écran éteint.
  // On empêche donc l'ancien JS de lancer une seconde fois le morceau suivant.
  window.onNativeTrackEnded = () => {
    if (typeof window.onNativePlaybackPaused === 'function') window.onNativePlaybackPaused();
  };

  window.onNativeTrackChanged = (uri, title, artist) => {
    syncNowPlaying(uri, title, artist);
  };

  const init = () => {
    readSongs();
    fixFolderSheet();
    filterLibrary();
    setInterval(() => {
      const stored = localStorage.getItem('tw_active_folder') || '';
      if (stored !== activeFolder) scheduleRefresh();
    }, 500);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
