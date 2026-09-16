/* tikoWiko Musique — option pour continuer automatiquement une playlist */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const A = window.Android || null;
  const KEY = 'tw_playlist_continue';
  let activePlaylistIndex = -1;

  function safeCall(name, ...args) {
    try { return A && typeof A[name] === 'function' ? A[name](...args) : null; }
    catch (_) { return null; }
  }

  function isEnabled() {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return true;
    try { return JSON.parse(raw) !== false; } catch (_) { return raw !== 'false'; }
  }

  function setEnabled(value) {
    localStorage.setItem(KEY, JSON.stringify(!!value));
    refreshToggle();
  }

  function getSongs() {
    try { return JSON.parse(safeCall('getSongs') || '[]'); }
    catch (_) { return []; }
  }

  function getPlaylists() {
    try {
      const value = JSON.parse(localStorage.getItem('tw_playlists') || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function queueForPlaylist(index) {
    const playlists = getPlaylists();
    const playlist = playlists[index];
    if (!playlist || !Array.isArray(playlist.uris)) return [];

    const songs = getSongs();
    const byUri = new Map(songs.map(song => [String(song.uri || ''), song]));
    return playlist.uris.map(uri => byUri.get(String(uri))).filter(Boolean).map(song => ({
      uri: String(song.uri || ''),
      title: song.title || 'Sans titre',
      artist: song.artist || 'Artiste inconnu',
      folder: song.folder || 'Musique'
    }));
  }

  function ensureToggle() {
    const sheet = $('#twPlaylistSheet');
    const add = $('#twPlaylistAdd');
    if (!sheet || !add || $('#twPlaylistContinue')) return;

    const button = document.createElement('button');
    button.id = 'twPlaylistContinue';
    button.type = 'button';
    button.className = 'tw-add-music tw-playlist-continue';
    add.after(button);
    button.addEventListener('click', () => setEnabled(!isEnabled()));

    if (!$('#twPlaylistContinueStyle')) {
      const style = document.createElement('style');
      style.id = 'twPlaylistContinueStyle';
      style.textContent = `
        #twPlaylistContinue{margin-top:8px}
        #twPlaylistContinue .tw-cont-state{margin-left:auto;min-width:42px;padding:5px 9px;border-radius:999px;border:1px solid rgba(232,205,126,.35);font:800 10px/1 sans-serif;letter-spacing:.04em;text-align:center}
        #twPlaylistContinue[aria-pressed="true"] .tw-cont-state{background:rgba(232,205,126,.16);color:#f4d47d;box-shadow:0 0 14px rgba(232,205,126,.12)}
      `;
      document.head.appendChild(style);
    }
    refreshToggle();
  }

  function refreshToggle() {
    const button = $('#twPlaylistContinue');
    if (!button) return;
    const on = isEnabled();
    button.setAttribute('aria-pressed', String(on));
    button.innerHTML = `<span>↪</span><span><strong>Continuer la playlist</strong><small>${on ? 'Le titre suivant démarre automatiquement' : 'Arrêt à la fin du titre'}</small></span><b class="tw-cont-state">${on ? 'ON' : 'OFF'}</b>`;
  }

  function playFromPlaylist(uri) {
    const queue = queueForPlaylist(activePlaylistIndex);
    const selected = queue.findIndex(song => String(song.uri) === String(uri));
    if (selected < 0) return false;

    if (isEnabled()) {
      safeCall('playQueue', JSON.stringify(queue), selected);
    } else {
      safeCall('playQueue', JSON.stringify([queue[selected]]), 0);
    }

    const sheet = $('#twPlaylistSheet');
    if (sheet) sheet.hidden = true;
    return true;
  }

  document.addEventListener('click', event => {
    const openRow = event.target.closest('[data-tw-pl-open]');
    if (openRow) {
      const index = Number(openRow.dataset.twPlOpen);
      if (Number.isFinite(index)) activePlaylistIndex = index;
      setTimeout(() => { ensureToggle(); refreshToggle(); }, 0);
      return;
    }

    const playButton = event.target.closest('#twPlaylistSongs .tw-pl-play');
    if (!playButton) return;
    const row = playButton.closest('.tw-pl-song');
    const uri = row?.dataset.uri;
    if (!uri || activePlaylistIndex < 0) return;

    if (playFromPlaylist(uri)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  const observer = new MutationObserver(() => {
    if ($('#twPlaylistSheet') && !$('#twPlaylistSheet').hidden) {
      ensureToggle();
      refreshToggle();
    }
  });

  const start = () => {
    observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['hidden']});
    ensureToggle();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
