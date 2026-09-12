/* tikoWiko Musique — dossiers + gestion complète des playlists, sans changer le design */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const A = window.Android || null;

  let songs = [];
  let activeFolder = localStorage.getItem('tw_active_folder') || '';
  let activePlaylist = -1;
  let folderObserver = null;
  let playlistObserver = null;

  function safeCall(name, ...args) {
    try { return A && typeof A[name] === 'function' ? A[name](...args) : null; }
    catch (_) { return null; }
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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

  function folderKey(raw) {
    return String(raw || 'Musique').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') || 'Musique';
  }

  function folderLabel(raw) {
    const k = folderKey(raw);
    const bits = k.split('/').filter(Boolean);
    return bits[bits.length - 1] || 'Musique';
  }

  function refreshSongs() {
    if (!A || !safeCall('hasAudioPermission')) {
      songs = [];
      return songs;
    }
    try { songs = JSON.parse(safeCall('getSongs') || '[]'); }
    catch (_) { songs = []; }
    songs.forEach(s => { s.folder = folderKey(s.folder); });
    if (activeFolder && !songs.some(s => s.folder === activeFolder)) {
      activeFolder = '';
      localStorage.removeItem('tw_active_folder');
    }
    return songs;
  }

  function updateScanCard() {
    const scan = $('.screen[data-screen="library"] .scan');
    if (!scan) return;
    scan.classList.add('tw-folder-select');
    scan.setAttribute('role', 'button');
    scan.setAttribute('tabindex', '0');
    scan.setAttribute('aria-label', 'Choisir un dossier de musique');
    const title = $('.scan-head span:first-child', scan);
    const note = $('.scan-note', scan);
    const code = $('code', scan);
    if (title) title.textContent = activeFolder ? 'Dossier sélectionné' : 'Dossiers de musique';
    if (note) note.textContent = 'Touchez pour choisir';
    if (code) code.textContent = activeFolder ? folderLabel(activeFolder) : 'Tous les dossiers';
  }

  function applyFolderFilter() {
    updateScanCard();
    const list = $('#libList');
    if (!list) return;
    if (!activeFolder) {
      $$('[data-track]', list).forEach(row => row.hidden = false);
      return;
    }

    // Comme dans la première TikowikoMusic : un dossier devient une bibliothèque filtrée.
    const titleChip = $('#libViews [data-view="titres"]');
    if (titleChip && !titleChip.classList.contains('is-on')) {
      titleChip.click();
      return;
    }

    let visible = 0;
    $$('[data-track]', list).forEach(row => {
      const index = Number(row.dataset.track);
      const song = songs[index];
      const keep = !!song && folderKey(song.folder) === activeFolder;
      row.hidden = !keep;
      if (keep) visible++;
    });
    const count = $('#libCount');
    if (count) count.textContent = `${visible} titre${visible !== 1 ? 's' : ''}`;
  }

  function setActiveFolder(folder) {
    activeFolder = folder ? folderKey(folder) : '';
    if (activeFolder) localStorage.setItem('tw_active_folder', activeFolder);
    else localStorage.removeItem('tw_active_folder');
    closeFolderSheet();
    requestAnimationFrame(() => {
      applyFolderFilter();
      toast(activeFolder ? `Dossier ${folderLabel(activeFolder)}` : 'Tous les dossiers');
    });
  }

  function ensureFolderSheet() {
    if ($('#twFolderSheet')) return;
    const sheet = document.createElement('div');
    sheet.id = 'twFolderSheet';
    sheet.className = 'tw-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="tw-sheet-card" role="dialog" aria-modal="true" aria-label="Choisir un dossier">
        <div class="tw-sheet-grip"></div>
        <div class="tw-sheet-head"><div><strong>Dossiers de musique</strong><span id="twFolderCount">0 dossier</span></div><button id="twFolderClose" aria-label="Fermer">×</button></div>
        <div id="twFolderList" class="tw-folder-list"></div>
      </div>`;
    ($('.phone-screen') || document.body).appendChild(sheet);
    $('#twFolderClose')?.addEventListener('click', closeFolderSheet);
    sheet.addEventListener('click', e => { if (e.target === sheet) closeFolderSheet(); });
  }

  function openFolderSheet() {
    refreshSongs();
    ensureFolderSheet();
    const sheet = $('#twFolderSheet');
    const host = $('#twFolderList');
    if (!sheet || !host) return;

    const grouped = new Map();
    songs.forEach(s => {
      const k = folderKey(s.folder);
      grouped.set(k, (grouped.get(k) || 0) + 1);
    });
    const folders = [...grouped.entries()].sort((a,b) => folderLabel(a[0]).localeCompare(folderLabel(b[0]), 'fr'));
    $('#twFolderCount').textContent = `${folders.length} dossier${folders.length !== 1 ? 's' : ''}`;

    host.innerHTML = `
      <button class="tw-folder-row${!activeFolder ? ' is-on' : ''}" data-tw-folder="">
        <span class="tw-folder-icon">♫</span><span><strong>Tous les dossiers</strong><small>${songs.length} titre${songs.length !== 1 ? 's' : ''}</small></span><b>${!activeFolder ? '✓' : '›'}</b>
      </button>` + folders.map(([folder,count]) => `
      <button class="tw-folder-row${activeFolder === folder ? ' is-on' : ''}" data-tw-folder="${esc(folder)}">
        <span class="tw-folder-icon">▰</span><span><strong>${esc(folderLabel(folder))}</strong><small>${count} titre${count !== 1 ? 's' : ''}</small></span><b>${activeFolder === folder ? '✓' : '›'}</b>
      </button>`).join('');

    $$('[data-tw-folder]', host).forEach(b => b.addEventListener('click', () => setActiveFolder(b.dataset.twFolder)));
    sheet.hidden = false;
  }

  function closeFolderSheet() {
    const sheet = $('#twFolderSheet');
    if (sheet) sheet.hidden = true;
  }

  function setupFolders() {
    refreshSongs();
    updateScanCard();
    const scan = $('.screen[data-screen="library"] .scan');
    if (scan && !scan.dataset.twBound) {
      scan.dataset.twBound = '1';
      scan.addEventListener('click', openFolderSheet);
      scan.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFolderSheet(); } });
    }

    const foldersChip = $('#libViews [data-view="dossiers"]');
    if (foldersChip && !foldersChip.dataset.twBound) {
      foldersChip.dataset.twBound = '1';
      foldersChip.addEventListener('click', e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        openFolderSheet();
      }, true);
    }

    const list = $('#libList');
    if (list && !folderObserver) {
      folderObserver = new MutationObserver(() => {
        refreshSongs();
        requestAnimationFrame(applyFolderFilter);
      });
      folderObserver.observe(list, {childList:true, subtree:false});
    }
    requestAnimationFrame(applyFolderFilter);
  }

  function getPlaylists() {
    let value = [];
    try { value = JSON.parse(localStorage.getItem('tw_playlists') || '[]'); } catch (_) {}
    if (!Array.isArray(value)) value = [];
    return value.map(p => ({
      name: String(p?.name || 'Playlist').trim() || 'Playlist',
      uris: Array.isArray(p?.uris) ? [...new Set(p.uris.map(String))] : []
    }));
  }

  function savePlaylists(playlists) {
    localStorage.setItem('tw_playlists', JSON.stringify(playlists));
  }

  function songByUri(uri) {
    return songs.find(s => String(s.uri) === String(uri));
  }

  function playSong(song) {
    if (!song) return;
    refreshSongs();
    const index = songs.findIndex(s => String(s.uri) === String(song.uri));
    const titleChip = $('#libViews [data-view="titres"]');
    if (titleChip && !titleChip.classList.contains('is-on')) titleChip.click();
    requestAnimationFrame(() => {
      const row = index >= 0 ? $(`#libList [data-track="${index}"]`) : null;
      if (row) row.click();
      else safeCall('play', song.uri, song.title || 'Sans titre', song.artist || 'Artiste inconnu');
      closePlaylistSheet();
      closeAddSheet();
    });
  }

  function renderEnhancedPlaylists() {
    refreshSongs();
    const list = $('#plList');
    if (!list) return;
    const playlists = getPlaylists();

    if (playlistObserver) playlistObserver.disconnect();
    if (!playlists.length) {
      list.innerHTML = '<li class="list-empty">Aucune playlist<span>Appuie sur + pour créer une playlist puis ajoute les musiques que tu veux.</span></li>';
    } else {
      list.innerHTML = playlists.map((p,i) => {
        const available = p.uris.map(songByUri).filter(Boolean);
        return `<li class="row tw-playlist-row" data-tw-pl-open="${i}" tabindex="0" role="button">
          <span class="tw-playlist-icon">♫</span>
          <div class="row-txt"><strong>${esc(p.name)}</strong><span>${available.length} titre${available.length !== 1 ? 's' : ''}</span></div>
          <svg class="row-go" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
        </li>`;
      }).join('');
    }

    const hint = $('#plHint .row-txt span');
    if (hint) hint.textContent = playlists.length ? 'Ouvre une playlist pour ajouter ou retirer des musiques' : 'Crée ta première playlist locale';

    if (playlistObserver) playlistObserver.observe(list, {childList:true});
  }

  function createPlaylist() {
    const name = prompt('Nom de la playlist :', 'Ma playlist');
    if (!name || !name.trim()) return;
    const playlists = getPlaylists();
    playlists.push({name:name.trim(), uris:[]});
    savePlaylists(playlists);
    activePlaylist = playlists.length - 1;
    renderEnhancedPlaylists();
    openPlaylistSheet(activePlaylist);
  }

  function ensurePlaylistSheet() {
    if ($('#twPlaylistSheet')) return;
    const sheet = document.createElement('div');
    sheet.id = 'twPlaylistSheet';
    sheet.className = 'tw-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="tw-sheet-card" role="dialog" aria-modal="true" aria-label="Playlist">
        <div class="tw-sheet-grip"></div>
        <div class="tw-sheet-head"><div><strong id="twPlaylistTitle">Playlist</strong><span id="twPlaylistCount">0 titre</span></div><button id="twPlaylistClose" aria-label="Fermer">×</button></div>
        <button id="twPlaylistAdd" class="tw-add-music"><span>＋</span><span><strong>Ajouter des musiques</strong><small>Choisir directement dans les titres du téléphone</small></span></button>
        <div id="twPlaylistSongs" class="tw-playlist-songs"></div>
      </div>`;
    ($('.phone-screen') || document.body).appendChild(sheet);
    $('#twPlaylistClose')?.addEventListener('click', closePlaylistSheet);
    $('#twPlaylistAdd')?.addEventListener('click', openAddSheet);
    sheet.addEventListener('click', e => { if (e.target === sheet) closePlaylistSheet(); });
  }

  function openPlaylistSheet(index) {
    refreshSongs();
    const playlists = getPlaylists();
    if (!playlists[index]) return;
    activePlaylist = index;
    ensurePlaylistSheet();
    renderPlaylistContents();
    $('#twPlaylistSheet').hidden = false;
  }

  function closePlaylistSheet() {
    const sheet = $('#twPlaylistSheet');
    if (sheet) sheet.hidden = true;
  }

  function renderPlaylistContents() {
    const playlists = getPlaylists();
    const p = playlists[activePlaylist];
    if (!p) return closePlaylistSheet();
    const available = p.uris.map(songByUri).filter(Boolean);
    $('#twPlaylistTitle').textContent = p.name;
    $('#twPlaylistCount').textContent = `${available.length} titre${available.length !== 1 ? 's' : ''}`;
    const host = $('#twPlaylistSongs');
    if (!available.length) {
      host.innerHTML = '<div class="tw-picker-empty"><strong>Playlist vide</strong><span>Appuie sur « Ajouter des musiques ».</span></div>';
      return;
    }
    host.innerHTML = available.map(s => `
      <div class="tw-pl-song" data-uri="${esc(s.uri)}">
        <button class="tw-pl-play" type="button"><span class="tw-song-note">♫</span><span class="tw-song-text"><strong>${esc(s.title || 'Sans titre')}</strong><small>${esc(s.artist || 'Artiste inconnu')}</small></span></button>
        <button class="tw-pl-remove" type="button" aria-label="Retirer ${esc(s.title || 'ce titre')} de la playlist">×</button>
      </div>`).join('');
    $$('.tw-pl-song', host).forEach(row => {
      $('.tw-pl-play', row)?.addEventListener('click', () => playSong(songByUri(row.dataset.uri)));
      $('.tw-pl-remove', row)?.addEventListener('click', () => removeFromPlaylist(row.dataset.uri));
    });
  }

  function removeFromPlaylist(uri) {
    const playlists = getPlaylists();
    const p = playlists[activePlaylist];
    if (!p) return;
    p.uris = p.uris.filter(u => String(u) !== String(uri));
    savePlaylists(playlists);
    renderPlaylistContents();
    renderEnhancedPlaylists();
    toast('Musique retirée de la playlist');
  }

  function ensureAddSheet() {
    if ($('#twAddSongsSheet')) return;
    const sheet = document.createElement('div');
    sheet.id = 'twAddSongsSheet';
    sheet.className = 'tw-sheet tw-sheet-top';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="tw-sheet-card" role="dialog" aria-modal="true" aria-label="Ajouter des musiques">
        <div class="tw-sheet-grip"></div>
        <div class="tw-sheet-head"><div><strong>Ajouter des musiques</strong><span id="twAddCount">0 titre</span></div><button id="twAddClose" aria-label="Fermer">×</button></div>
        <label class="tw-picker-search"><span>⌕</span><input id="twAddSearch" type="search" placeholder="Titre ou artiste" autocomplete="off" /></label>
        <div id="twAddSongs" class="tw-song-list"></div>
      </div>`;
    ($('.phone-screen') || document.body).appendChild(sheet);
    $('#twAddClose')?.addEventListener('click', closeAddSheet);
    $('#twAddSearch')?.addEventListener('input', renderAddSongs);
    sheet.addEventListener('click', e => { if (e.target === sheet) closeAddSheet(); });
  }

  function openAddSheet() {
    refreshSongs();
    ensureAddSheet();
    $('#twAddSongsSheet').hidden = false;
    renderAddSongs();
  }

  function closeAddSheet() {
    const sheet = $('#twAddSongsSheet');
    if (sheet) sheet.hidden = true;
  }

  function renderAddSongs() {
    const host = $('#twAddSongs');
    if (!host) return;
    const playlists = getPlaylists();
    const p = playlists[activePlaylist];
    if (!p) return;
    const q = ($('#twAddSearch')?.value || '').trim().toLowerCase();
    const filtered = songs.filter(s => !q || `${s.title || ''} ${s.artist || ''} ${s.album || ''}`.toLowerCase().includes(q));
    $('#twAddCount').textContent = `${filtered.length} titre${filtered.length !== 1 ? 's' : ''}`;
    if (!filtered.length) {
      host.innerHTML = `<div class="tw-picker-empty"><strong>${songs.length ? 'Aucun résultat' : 'Aucune musique sur ce téléphone'}</strong><span>${songs.length ? 'Essaie un autre mot.' : 'L’application reste vide tant que le téléphone ne contient pas de musique.'}</span></div>`;
      return;
    }
    host.innerHTML = filtered.map(s => {
      const added = p.uris.some(u => String(u) === String(s.uri));
      return `<button class="tw-add-row${added ? ' is-added' : ''}" data-add-uri="${esc(s.uri)}" type="button">
        <span class="tw-song-note">♫</span><span class="tw-song-text"><strong>${esc(s.title || 'Sans titre')}</strong><small>${esc(s.artist || 'Artiste inconnu')}</small></span><b>${added ? '✓' : '+'}</b>
      </button>`;
    }).join('');
    $$('[data-add-uri]', host).forEach(b => b.addEventListener('click', () => togglePlaylistSong(b.dataset.addUri)));
  }

  function togglePlaylistSong(uri) {
    const playlists = getPlaylists();
    const p = playlists[activePlaylist];
    if (!p) return;
    const exists = p.uris.some(u => String(u) === String(uri));
    if (exists) p.uris = p.uris.filter(u => String(u) !== String(uri));
    else p.uris.push(uri);
    savePlaylists(playlists);
    renderAddSongs();
    renderPlaylistContents();
    renderEnhancedPlaylists();
  }

  function setupPlaylists() {
    const newButton = $('#newPl');
    if (newButton && !newButton.dataset.twEnhanced) {
      newButton.dataset.twEnhanced = '1';
      newButton.addEventListener('click', e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        createPlaylist();
      }, true);
    }

    const list = $('#plList');
    if (list && !list.dataset.twEnhanced) {
      list.dataset.twEnhanced = '1';
      list.addEventListener('click', e => {
        const row = e.target.closest('[data-tw-pl-open]');
        if (!row) return;
        e.preventDefault();
        openPlaylistSheet(Number(row.dataset.twPlOpen));
      }, true);
      list.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const row = e.target.closest('[data-tw-pl-open]');
        if (!row) return;
        e.preventDefault();
        openPlaylistSheet(Number(row.dataset.twPlOpen));
      }, true);
      playlistObserver = new MutationObserver(() => {
        setTimeout(renderEnhancedPlaylists, 0);
      });
      playlistObserver.observe(list, {childList:true});
    }
    renderEnhancedPlaylists();
  }

  function emptyInstallCleanup() {
    // Aucun morceau de démonstration : la bibliothèque vient uniquement de MediaStore Android.
    refreshSongs();
    if (!songs.length) {
      const count = $('#libCount');
      if (count) count.textContent = '0 titre';
      const code = $('.screen[data-screen="library"] .scan code');
      if (code && !activeFolder) code.textContent = 'Aucune musique trouvée';
    }
  }

  function init() {
    setupFolders();
    setupPlaylists();
    emptyInstallCleanup();

    $$('.nav-item').forEach(b => b.addEventListener('click', () => {
      setTimeout(() => {
        if (b.dataset.go === 'library') { refreshSongs(); applyFolderFilter(); }
        if (b.dataset.go === 'playlists') renderEnhancedPlaylists();
      }, 0);
    }));

    window.addEventListener('focus', () => {
      refreshSongs();
      applyFolderFilter();
      renderEnhancedPlaylists();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();