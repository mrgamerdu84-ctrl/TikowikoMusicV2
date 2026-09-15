/* TikowikoMusicV2 — dossiers physiques stricts + synchro du lecteur natif */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const A = window.Android || null;
  let songs = [];
  let activeFolder = '';
  let scheduled = false;
  let currentNativeSong = null;
  let repeatOneArmedUri = '';
  let repeatQueueChanging = false;

  const safeCall = (name, ...args) => {
    try { return A && typeof A[name] === 'function' ? A[name](...args) : null; }
    catch (_) { return null; }
  };

  const folderKey = raw => String(raw || 'Musique')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '') || 'Musique';

  function repeatMode() {
    const mode = localStorage.getItem('tw_repeat') || 'off';
    return mode === 'one' || mode === 'all' ? mode : 'off';
  }

  function playbackState() {
    try { return JSON.parse(safeCall('getPlaybackState') || '{}'); }
    catch (_) { return {}; }
  }

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

  function songByUri(uri) {
    if (!songs.length) readSongs();
    return songs.find(s => String(s.uri || '') === String(uri || '')) || null;
  }

  function realFolders() {
    return [...new Set(songs.map(s => s.folder))]
      .sort((a, b) => a.localeCompare(b, 'fr', {sensitivity:'base'}));
  }

  function physicalFolderSongs(song) {
    if (!song) return [];
    const folder = folderKey(song.folder || activeFolder || 'Musique');
    return songs.filter(s => folderKey(s.folder) === folder);
  }

  function queueEntry(song) {
    return {
      uri: song.uri || '',
      title: song.title || 'Sans titre',
      artist: song.artist || 'Artiste inconnu',
      folder: folderKey(song.folder || activeFolder || 'Musique')
    };
  }

  function seekBack(position) {
    const ms = Math.max(0, Number(position) || 0);
    if (!ms) return;
    // Le MediaPlayer est préparé en asynchrone : deux essais légers évitent
    // de revenir au début lorsqu'on change le mode de répétition en plein titre.
    setTimeout(() => safeCall('seekTo', ms), 260);
    setTimeout(() => safeCall('seekTo', ms), 620);
  }

  function armRepeatOne(song, preservePosition = 0) {
    if (!A || !song || !song.uri || typeof A.playQueue !== 'function') return;

    // Le service Android sait avancer tout seul dans sa file, même écran éteint.
    // On lui donne donc plusieurs copies du même morceau : la répétition reste
    // native et ne dépend pas d'un timer JavaScript en arrière-plan.
    const entry = queueEntry(song);
    const queue = Array.from({length: 64}, () => ({...entry}));
    repeatOneArmedUri = String(song.uri);
    currentNativeSong = song;
    repeatQueueChanging = true;
    safeCall('playQueue', JSON.stringify(queue), 0);
    seekBack(preservePosition);
    setTimeout(() => { repeatQueueChanging = false; }, 900);
  }

  function restorePhysicalQueue(song, preservePosition = 0) {
    if (!A || !song || !song.uri) return;
    repeatOneArmedUri = '';
    repeatQueueChanging = true;
    safeCall('play', song.uri, song.title || 'Sans titre', song.artist || 'Artiste inconnu');
    seekBack(preservePosition);
    setTimeout(() => { repeatQueueChanging = false; }, 900);
  }

  function applyRepeatModeAfterButton() {
    setTimeout(() => {
      readSongs();
      const state = playbackState();
      const song = songByUri(state.uri) || currentNativeSong;
      if (!song) return;
      const position = Number(state.position) || 0;
      const mode = repeatMode();

      if (mode === 'one') {
        armRepeatOne(song, position);
      } else if (repeatOneArmedUri) {
        // En quittant « un titre », on remet la vraie file du dossier afin que
        // Suivant et la lecture automatique retrouvent leur comportement normal.
        restorePhysicalQueue(song, position);
      }
    }, 30);
  }

  function playAdjacentRealSong(delta) {
    readSongs();
    const state = playbackState();
    const current = songByUri(state.uri) || currentNativeSong;
    if (!current) return;
    const folderSongs = physicalFolderSongs(current);
    if (!folderSongs.length) return;
    let index = folderSongs.findIndex(s => String(s.uri) === String(current.uri));
    if (index < 0) index = 0;
    const nextIndex = (index + delta + folderSongs.length) % folderSongs.length;
    const target = folderSongs[nextIndex];
    repeatOneArmedUri = '';
    safeCall('play', target.uri, target.title || 'Sans titre', target.artist || 'Artiste inconnu');
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
      currentNativeSong = s;
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
    } else {
      currentNativeSong = {uri, title:title || 'Sans titre', artist:artist || 'Artiste inconnu', folder:activeFolder || 'Musique'};
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

    // Si l'utilisateur choisit un autre morceau pendant « répéter un titre »,
    // la nouvelle sélection doit devenir le morceau à répéter.
    if (repeatMode() === 'one' && e.target.closest('[data-track], [data-q]')) {
      repeatOneArmedUri = '';
    }

    const btn = e.target.closest('.controls .icon-btn');
    if (!btn || !A) return;
    const buttons = $$('.controls .icon-btn');
    const pos = buttons.indexOf(btn);
    const label = String(btn.getAttribute('aria-label') || '').toLowerCase();
    const previous = label.includes('préc') || label.includes('preced') || pos === 1;
    const next = label.includes('suiv') || pos === 2;
    const repeatButton = label.includes('rép') || label.includes('rep') || pos === 3;

    if (previous) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (repeatMode() === 'one') playAdjacentRealSong(-1);
      else if (typeof A.previous === 'function') A.previous();
    } else if (next) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (repeatMode() === 'one') playAdjacentRealSong(1);
      else if (typeof A.next === 'function') A.next();
    } else if (repeatButton) {
      // L'ancien app.js met d'abord à jour tw_repeat pendant la phase bubble.
      // On applique ensuite le nouveau mode à la file native Android.
      applyRepeatModeAfterButton();
    }
  }, true);

  const observer = new MutationObserver(scheduleRefresh);
  if (document.body) observer.observe(document.body, {childList:true, subtree:true});

  // Le service Android avance déjà dans le vrai dossier, même écran éteint.
  // Ici on ne relance quelque chose que lorsqu'il atteint réellement la fin.
  window.onNativeTrackEnded = () => {
    const mode = repeatMode();
    readSongs();

    if (mode === 'one') {
      const state = playbackState();
      const song = songByUri(state.uri) || currentNativeSong;
      if (song) {
        armRepeatOne(song, 0);
        return;
      }
    }

    if (mode === 'all') {
      const state = playbackState();
      const current = songByUri(state.uri) || currentNativeSong;
      const folderSongs = physicalFolderSongs(current);
      const first = folderSongs[0];
      if (first) {
        repeatOneArmedUri = '';
        safeCall('play', first.uri, first.title || 'Sans titre', first.artist || 'Artiste inconnu');
        return;
      }
    }

    if (typeof window.onNativePlaybackPaused === 'function') window.onNativePlaybackPaused();
  };

  window.onNativeTrackChanged = (uri, title, artist) => {
    syncNowPlaying(uri, title, artist);

    // Quand « un titre » est actif, toute nouvelle sélection devient
    // immédiatement une file composée uniquement de ce morceau.
    if (repeatMode() === 'one' && !repeatQueueChanging && String(uri || '') !== repeatOneArmedUri) {
      const song = songByUri(uri) || currentNativeSong;
      if (song) {
        setTimeout(() => {
          if (repeatMode() === 'one' && !repeatQueueChanging && String(song.uri || '') !== repeatOneArmedUri) {
            armRepeatOne(song, 0);
          }
        }, 80);
      }
    } else if (repeatMode() !== 'one') {
      repeatOneArmedUri = '';
    }
  };

  const init = () => {
    readSongs();
    fixFolderSheet();
    filterLibrary();
    const state = playbackState();
    currentNativeSong = songByUri(state.uri) || currentNativeSong;

    // Si l'appli est relancée alors que « répéter un titre » était déjà actif,
    // on remet le lecteur natif dans ce mode sans attendre le prochain clic.
    if (repeatMode() === 'one' && currentNativeSong && state.playing) {
      armRepeatOne(currentNativeSong, Number(state.position) || 0);
    }

    setInterval(() => {
      const stored = localStorage.getItem('tw_active_folder') || '';
      if (stored !== activeFolder) scheduleRefresh();
    }, 500);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
