/* TikoBot — assistant local pour rechercher, commenter et lancer la musique du téléphone */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const A = window.Android || null;

  let songs = [];
  let queue = [];
  let queuePos = -1;
  let previousEnded = null;

  const norm = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function safeCall(name, ...args) {
    try { return A && typeof A[name] === 'function' ? A[name](...args) : null; }
    catch (_) { return null; }
  }

  function folderKey(raw) {
    return String(raw || 'Musique').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') || 'Musique';
  }

  function folderLabel(raw) {
    const bits = folderKey(raw).split('/').filter(Boolean);
    return bits[bits.length - 1] || 'Musique';
  }

  function refreshSongs() {
    if (!A || !safeCall('hasAudioPermission')) {
      songs = [];
      return;
    }
    try { songs = JSON.parse(safeCall('getSongs') || '[]'); }
    catch (_) { songs = []; }
    songs.forEach((s, i) => {
      s._index = i;
      s.folder = folderKey(s.folder);
      s.title = s.title || 'Sans titre';
      s.artist = s.artist || 'Artiste inconnu';
      s.album = s.album || 'Album inconnu';
    });
  }

  function ensureUi() {
    if ($('#tikobotFab')) return;
    const host = $('.phone-screen') || document.body;
    const fab = document.createElement('button');
    fab.id = 'tikobotFab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Ouvrir TikoBot');
    fab.innerHTML = '<span>◆</span><b>TikoBot</b>';

    const sheet = document.createElement('div');
    sheet.id = 'tikobotSheet';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="tikobot-card" role="dialog" aria-modal="true" aria-label="TikoBot">
        <div class="tikobot-head">
          <div class="tikobot-avatar">◆</div>
          <div><strong>TikoBot</strong><span>Dis-moi ce que tu veux écouter</span></div>
          <button id="tikobotClose" type="button" aria-label="Fermer">×</button>
        </div>
        <div id="tikobotReply" class="tikobot-reply">Exemples : « Joue l’album Gold », « Mets Stromae », « Lance le dossier Famille ».</div>
        <div class="tikobot-input-row">
          <input id="tikobotInput" type="text" autocomplete="off" placeholder="Titre, artiste, album ou dossier…" />
          <button id="tikobotMic" type="button" aria-label="Parler">🎙</button>
          <button id="tikobotGo" type="button">Lancer</button>
        </div>
        <div id="tikobotResults" class="tikobot-results"></div>
      </div>`;

    host.appendChild(fab);
    host.appendChild(sheet);

    fab.addEventListener('click', open);
    $('#tikobotClose')?.addEventListener('click', close);
    sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
    $('#tikobotGo')?.addEventListener('click', runInput);
    $('#tikobotInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') runInput(); });
    $('#tikobotMic')?.addEventListener('click', () => {
      const ok = safeCall('startVoiceSearch');
      if (ok === null) reply('La recherche vocale n’est pas disponible ici. Tu peux écrire ta demande.', true);
      else reply('Je t’écoute…', true);
    });
  }

  function open() {
    refreshSongs();
    const sheet = $('#tikobotSheet');
    if (!sheet) return;
    sheet.hidden = false;
    if (!songs.length) {
      reply('Ta bibliothèque est vide. Ajoute tes propres musiques sur le téléphone puis relance la recherche.', true);
    } else {
      reply(`${songs.length} titre${songs.length > 1 ? 's' : ''} disponible${songs.length > 1 ? 's' : ''}. Que veux-tu écouter ?`);
    }
    setTimeout(() => $('#tikobotInput')?.focus(), 80);
  }

  function close() {
    safeCall('stopTikoBotVoice');
    const sheet = $('#tikobotSheet');
    if (sheet) sheet.hidden = true;
  }

  function reply(text, speak = false) {
    const el = $('#tikobotReply');
    if (el) el.textContent = text;
    if (speak) safeCall('speakTikoBot', String(text || ''));
  }

  function opinionFor(song) {
    const key = `${song?.title || ''}|${song?.artist || ''}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
    const opinions = [
      'Bon choix, celle-là a une super énergie.',
      'Ah oui, celle-ci je la valide.',
      'Pas mal du tout, je la mettrais bien dans une playlist.',
      'Celle-là passe vraiment bien, j’aime le choix.',
      'Hmm… un peu moins mon style, mais elle a quelque chose.',
      'Ça, c’est un morceau que je réécouterais volontiers.',
      'Très bon choix, elle a une belle ambiance.'
    ];
    return opinions[hash % opinions.length];
  }

  function runInput() {
    const input = $('#tikobotInput');
    if (!input) return;
    runCommand(input.value);
  }

  function scoreSong(song, query) {
    const q = norm(query);
    if (!q) return 0;
    const title = norm(song.title), artist = norm(song.artist), album = norm(song.album), folder = norm(folderLabel(song.folder));
    let score = 0;
    if (title === q) score += 120;
    else if (title.startsWith(q)) score += 95;
    else if (title.includes(q)) score += 75;
    if (artist === q) score += 90;
    else if (artist.includes(q)) score += 60;
    if (album === q) score += 80;
    else if (album.includes(q)) score += 45;
    if (folder === q) score += 70;
    else if (folder.includes(q)) score += 35;
    q.split(' ').filter(Boolean).forEach(token => {
      if (title.includes(token)) score += 10;
      if (artist.includes(token)) score += 8;
      if (album.includes(token)) score += 5;
      if (folder.includes(token)) score += 4;
    });
    return score;
  }

  function indicesForField(field, query) {
    const q = norm(query);
    return songs
      .map((s, i) => ({i, v: field === 'folder' ? folderLabel(s.folder) : s[field]}))
      .filter(x => norm(x.v) === q || norm(x.v).includes(q))
      .map(x => x.i);
  }

  function playIndex(index, comment = true) {
    const song = songs[index];
    if (!song) return;
    localStorage.setItem('tw_active_folder', folderKey(song.folder));

    const titleChip = $('#libViews [data-view="titres"]');
    if (titleChip && !titleChip.classList.contains('is-on')) titleChip.click();
    const search = $('#searchInput');
    if (search && search.value) {
      search.value = '';
      search.dispatchEvent(new Event('input', {bubbles:true}));
    }

    requestAnimationFrame(() => {
      const row = $(`#libList [data-track="${index}"]`);
      if (row) {
        row.hidden = false;
        row.click();
      } else {
        safeCall('play', song.uri, song.title, song.artist);
      }
    });

    if (comment) {
      reply(`Je lance ${song.title}. ${opinionFor(song)}`, true);
    } else {
      reply(`Lecture : ${song.title} — ${song.artist}`);
    }
  }

  function playQueue(indices, label) {
    queue = [...new Set(indices)].filter(i => songs[i]);
    queuePos = 0;
    if (!queue.length) {
      reply(`Je n’ai rien trouvé pour ${label}.`, true);
      return;
    }
    playIndex(queue[0], false);
    reply(`${label}. ${queue.length} titre${queue.length > 1 ? 's' : ''} en file de lecture.`, true);
  }

  function showMatches(query) {
    const ranked = songs.map((s, i) => ({i, s, score: scoreSong(s, query)}))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    const host = $('#tikobotResults');
    if (!host) return;
    if (!ranked.length) {
      host.innerHTML = '';
      reply(`Je n’ai trouvé aucun morceau correspondant à « ${query} » dans ton téléphone.`, true);
      return;
    }
    host.innerHTML = ranked.map(x => `
      <button class="tikobot-result" type="button" data-ti="${x.i}">
        <span class="tikobot-note">♫</span>
        <span><strong>${esc(x.s.title)}</strong><small>${esc(x.s.artist)} · ${esc(x.s.album)} · ${esc(folderLabel(x.s.folder))}</small></span>
        <b>▶</b>
      </button>`).join('');
    $$('[data-ti]', host).forEach(b => b.addEventListener('click', () => {
      queue = [];
      queuePos = -1;
      playIndex(Number(b.dataset.ti), true);
    }));
    reply(`${ranked.length} résultat${ranked.length > 1 ? 's' : ''} trouvé${ranked.length > 1 ? 's' : ''}.`, true);
  }

  function cleanCommand(text) {
    return String(text || '').trim()
      .replace(/^(s'il te plait|s il te plait|stp)\s+/i, '')
      .replace(/^(joue|mets|met|lance|ecoute|écoute|demarre|démarre|cherche|trouve)\s+/i, '')
      .replace(/\s+(s'il te plait|s il te plait|stp)$/i, '')
      .trim();
  }

  function runCommand(text) {
    refreshSongs();
    const raw = String(text || '').trim();
    const normalized = norm(raw);
    const results = $('#tikobotResults');
    if (results) results.innerHTML = '';

    if (!raw) return reply('Dis-moi un titre, un artiste, un album ou un dossier.', true);
    if (!songs.length) return reply('Je ne trouve aucune musique sur ce téléphone.', true);

    let m = normalized.match(/(?:album)\s+(.+)/);
    if (m) {
      const q = cleanCommand(raw).replace(/^l['’]?album\s+/i, '').replace(/^album\s+/i, '');
      const indices = indicesForField('album', q);
      if (indices.length) return playQueue(indices, `Album ${songs[indices[0]].album}`);
      return showMatches(q);
    }

    m = normalized.match(/(?:dossier)\s+(.+)/);
    if (m) {
      const q = cleanCommand(raw).replace(/^le\s+dossier\s+/i, '').replace(/^dossier\s+/i, '');
      const indices = indicesForField('folder', q);
      if (indices.length) return playQueue(indices, `Dossier ${folderLabel(songs[indices[0]].folder)}`);
      return showMatches(q);
    }

    m = normalized.match(/(?:artiste)\s+(.+)/);
    if (m) {
      const q = cleanCommand(raw).replace(/^l['’]?artiste\s+/i, '').replace(/^artiste\s+/i, '');
      const indices = indicesForField('artist', q);
      if (indices.length) return playQueue(indices, `Artiste ${songs[indices[0]].artist}`);
      return showMatches(q);
    }

    const q = cleanCommand(raw).replace(/^(la chanson|le titre)\s+/i, '').trim();
    const ranked = songs.map((s, i) => ({i, score: scoreSong(s, q)})).filter(x => x.score > 0).sort((a,b) => b.score - a.score);
    if (ranked.length && ranked[0].score >= 75) {
      queue = [];
      queuePos = -1;
      return playIndex(ranked[0].i, true);
    }
    showMatches(q);
  }

  window.onTikoBotVoiceResult = text => {
    ensureUi();
    const input = $('#tikobotInput');
    if (input) input.value = text || '';
    runCommand(text || '');
  };

  window.onTikoBotVoiceError = () => {
    ensureUi();
    reply('Je n’ai pas compris. Réessaie ou écris ta demande.', true);
  };

  function init() {
    ensureUi();
    refreshSongs();
    previousEnded = window.onNativeTrackEnded;
    window.onNativeTrackEnded = () => {
      if (queue.length && queuePos >= 0 && queuePos + 1 < queue.length) {
        queuePos += 1;
        playIndex(queue[queuePos], false);
        return;
      }
      if (queue.length) {
        queue = [];
        queuePos = -1;
      }
      if (typeof previousEnded === 'function') previousEnded();
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();