/* TikoBot — personnalité vivante, humeurs et mémoire locale légère */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const A = window.Android || null;
  const MEMORY_KEY = 'tw_tikobot_memory_v1';

  let songs = [];
  let moodTimer = null;
  let idleTimer = null;
  let pendingManual = null;
  let lastTrackUri = '';

  function safeCall(name, ...args) {
    try { return A && typeof A[name] === 'function' ? A[name](...args) : null; }
    catch (_) { return null; }
  }

  function refreshSongs() {
    try { songs = JSON.parse(safeCall('getSongs') || '[]'); }
    catch (_) { songs = []; }
    return songs;
  }

  function readMemory() {
    try {
      const value = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}');
      return {
        artists: value && typeof value.artists === 'object' ? value.artists : {},
        tracks: value && typeof value.tracks === 'object' ? value.tracks : {}
      };
    } catch (_) {
      return {artists:{}, tracks:{}};
    }
  }

  function writeMemory(memory) {
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(memory)); } catch (_) {}
  }

  function key(value) {
    return String(value || '').trim().toLocaleLowerCase('fr');
  }

  function rememberSong(song) {
    if (!song) return;
    const memory = readMemory();
    const now = Date.now();
    const artistKey = key(song.artist || 'Artiste inconnu');
    const trackKey = String(song.uri || `${song.title}|${song.artist}`);

    const artist = memory.artists[artistKey] || {name:song.artist || 'Artiste inconnu', count:0, last:0};
    artist.name = song.artist || artist.name;
    artist.count = Number(artist.count || 0) + 1;
    artist.last = now;
    memory.artists[artistKey] = artist;

    const track = memory.tracks[trackKey] || {title:song.title || 'Sans titre', count:0, last:0};
    track.title = song.title || track.title;
    track.count = Number(track.count || 0) + 1;
    track.last = now;
    memory.tracks[trackKey] = track;

    writeMemory(memory);
  }

  function snapshotBefore(song) {
    const memory = readMemory();
    const artistKey = key(song?.artist || 'Artiste inconnu');
    const trackKey = String(song?.uri || `${song?.title || ''}|${song?.artist || ''}`);
    return {
      artist: memory.artists[artistKey] || null,
      track: memory.tracks[trackKey] || null
    };
  }

  function hashFor(song) {
    const text = `${song?.title || ''}|${song?.artist || ''}`;
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash * 31) + text.charCodeAt(i)) >>> 0;
    return hash;
  }

  function opinionFor(song, before) {
    const artistCount = Number(before?.artist?.count || 0);
    const trackCount = Number(before?.track?.count || 0);
    const lastArtist = Number(before?.artist?.last || 0);
    const days = lastArtist ? (Date.now() - lastArtist) / 86400000 : 0;

    if (trackCount >= 2) {
      return {mood:'happy', text:`On la remet ! Je crois que ${song.title} fait partie de tes préférées.`};
    }
    if (artistCount >= 4) {
      return {mood:'happy', text:`Tu reviens souvent sur ${song.artist}. Je commence à bien connaître tes habitudes.`};
    }
    if (artistCount > 0 && days >= 7) {
      return {mood:'surprised', text:`Ah, ${song.artist} ! Ça faisait un moment qu’on ne l’avait pas écouté.`};
    }

    const opinions = [
      {mood:'happy', text:'Ah oui, celle-là je la valide.'},
      {mood:'happy', text:'Bon choix, elle a une super ambiance.'},
      {mood:'happy', text:'Pas mal du tout. Je la garderais bien dans une playlist.'},
      {mood:'surprised', text:'Oh, joli choix. Je ne m’attendais pas à celle-là.'},
      {mood:'curious', text:'Hmm… un peu moins mon style, mais elle a quelque chose.'},
      {mood:'calm', text:'Celle-ci passe vraiment bien. Bon choix.'},
      {mood:'happy', text:'Ça, c’est le genre de morceau que je réécouterais volontiers.'}
    ];
    return opinions[hashFor(song) % opinions.length];
  }

  function ensureBubble() {
    let bubble = $('#tikobotLifeBubble');
    if (bubble) return bubble;
    const host = $('.phone-screen') || document.body;
    bubble = document.createElement('div');
    bubble.id = 'tikobotLifeBubble';
    bubble.hidden = true;
    host.appendChild(bubble);
    return bubble;
  }

  function showBubble(text, duration = 4200) {
    const bubble = ensureBubble();
    bubble.textContent = String(text || '');
    bubble.hidden = false;
    bubble.classList.remove('is-on');
    requestAnimationFrame(() => bubble.classList.add('is-on'));
    clearTimeout(bubble._timer);
    bubble._timer = setTimeout(() => {
      bubble.classList.remove('is-on');
      setTimeout(() => { bubble.hidden = true; }, 220);
    }, duration);
  }

  function setMood(mood, duration = 0) {
    const character = $('.tikobot-character');
    const fab = $('#tikobotFab');
    if (character) character.dataset.mood = mood || 'idle';
    if (fab) fab.dataset.mood = mood || 'idle';
    document.dispatchEvent(new CustomEvent('tikobot:mood', {detail:{mood:mood || 'idle'}}));

    if (moodTimer) clearTimeout(moodTimer);
    moodTimer = null;
    if (duration > 0) {
      moodTimer = setTimeout(() => setMood(isPlaying() ? 'dance' : 'idle'), duration);
    }
  }

  function isPlaying() {
    try {
      const state = JSON.parse(safeCall('getPlaybackState') || '{}');
      return !!state.playing;
    } catch (_) { return false; }
  }

  function speakReaction(song) {
    if (!song) return;
    const before = snapshotBefore(song);
    const reaction = opinionFor(song, before);
    const full = `Je lance ${song.title}. ${reaction.text}`;
    const reply = $('#tikobotReply');
    if (reply) reply.textContent = full;
    showBubble(reaction.text);
    setMood(reaction.mood || 'happy', 2800);
    safeCall('speakTikoBot', full);
  }

  function findSong(uri, title, artist) {
    if (!songs.length) refreshSongs();
    return songs.find(s => String(s.uri || '') === String(uri || '')) ||
      songs.find(s => String(s.title || '') === String(title || '') && String(s.artist || '') === String(artist || '')) || null;
  }

  function onTrackChanged(uri, title, artist) {
    const song = findSong(uri, title, artist) || {uri, title:title || 'Sans titre', artist:artist || 'Artiste inconnu'};
    const beforeUri = lastTrackUri;
    lastTrackUri = String(uri || '');

    if (!beforeUri || beforeUri !== lastTrackUri) rememberSong(song);

    const manual = pendingManual;
    pendingManual = null;
    if (manual && Date.now() - manual.at < 3500) {
      const matches = !manual.uri || String(manual.uri) === String(uri || '');
      if (matches) speakReaction(song);
    }

    setMood(isPlaying() ? 'dance' : 'calm');
  }

  function bindManualChoices() {
    document.addEventListener('click', event => {
      const row = event.target.closest('#libList [data-track]');
      if (row && event.isTrusted) {
        refreshSongs();
        const index = Number(row.dataset.track);
        const song = songs[index];
        pendingManual = {at:Date.now(), uri:song?.uri || '', index};
        setMood('surprised', 900);
        return;
      }

      if (event.target.closest('#tikobotMic')) {
        setMood('listening');
        return;
      }
      if (event.target.closest('#tikobotGo')) {
        setMood('curious', 1600);
        return;
      }
      if (event.target.closest('#tikobotFab')) {
        setMood('happy', 1800);
        scheduleIdleGesture();
        return;
      }
      if (event.target.closest('#tikobotClose')) {
        setMood('idle');
      }
    }, true);
  }

  function watchSpeechBubble() {
    const attach = () => {
      const reply = $('#tikobotReply');
      if (!reply || reply.dataset.lifeObserved) return;
      reply.dataset.lifeObserved = '1';
      const observer = new MutationObserver(() => {
        if ($('#tikobotSheet')?.hidden) return;
        setMood('talking', Math.min(3600, 900 + reply.textContent.length * 24));
      });
      observer.observe(reply, {childList:true, characterData:true, subtree:true});
    };
    attach();
    const bodyObserver = new MutationObserver(attach);
    bodyObserver.observe(document.body, {childList:true, subtree:true});
  }

  function scheduleIdleGesture() {
    if (idleTimer) clearTimeout(idleTimer);
    const delay = 6500 + Math.floor(Math.random() * 5500);
    idleTimer = setTimeout(() => {
      const sheet = $('#tikobotSheet');
      if (sheet && !sheet.hidden) {
        const moods = ['curious','calm','surprised'];
        setMood(moods[Math.floor(Math.random() * moods.length)], 1200);
        scheduleIdleGesture();
      }
    }, delay);
  }

  function installStyle() {
    if ($('#tikobotLifeStyle')) return;
    const style = document.createElement('style');
    style.id = 'tikobotLifeStyle';
    style.textContent = `
      #tikobotLifeBubble{position:absolute;right:16px;bottom:126px;z-index:89;max-width:min(270px,72%);padding:10px 12px;border-radius:14px 14px 4px 14px;border:1px solid rgba(232,205,126,.35);background:rgba(17,18,23,.97);color:#f3f3f5;font:600 12px/1.35 sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.38);opacity:0;transform:translateY(6px) scale(.97);transition:opacity .2s ease,transform .2s ease;pointer-events:none}
      #tikobotLifeBubble.is-on{opacity:1;transform:translateY(0) scale(1)}
      .tikobot-character svg path:nth-of-type(1),.tikobot-character svg path:nth-of-type(2){transform-box:fill-box;transform-origin:center;animation:twLifeBlink 5.4s infinite}
      .tikobot-character[data-mood="happy"]{animation:twLifeHappy .7s ease-in-out infinite alternate}
      .tikobot-character[data-mood="curious"]{animation:twLifeCurious 1.7s ease-in-out infinite}
      .tikobot-character[data-mood="surprised"]{animation:twLifeSurprise .7s ease-out}
      .tikobot-character[data-mood="listening"]{animation:twLifeListen 1.25s ease-in-out infinite}
      .tikobot-character[data-mood="talking"]{animation:twLifeTalkBody .52s ease-in-out infinite alternate}
      .tikobot-character[data-mood="talking"] svg path:nth-of-type(3){transform-box:fill-box;transform-origin:center;animation:twLifeMouth .24s ease-in-out infinite alternate}
      .tikobot-character[data-mood="dance"]{animation:twLifeDance .72s ease-in-out infinite alternate}
      .tikobot-character[data-mood="calm"]{animation:twRobotFloat 4.4s ease-in-out infinite}
      #tikobotFab[data-mood="listening"] .tikobot-mini-face,#tikobotFab[data-mood="talking"] .tikobot-mini-face{box-shadow:0 0 0 3px rgba(255,55,84,.12),0 0 16px rgba(255,55,84,.38)}
      @keyframes twLifeBlink{0%,92%,100%{transform:scaleY(1)}94%,96%{transform:scaleY(.08)}}
      @keyframes twLifeHappy{from{transform:translateY(0) rotate(-1deg)}to{transform:translateY(-5px) rotate(1deg)}}
      @keyframes twLifeCurious{0%,100%{transform:rotate(0)}35%{transform:rotate(-4deg)}70%{transform:rotate(3deg)}}
      @keyframes twLifeSurprise{0%{transform:scale(.94)}55%{transform:scale(1.06)}100%{transform:scale(1)}}
      @keyframes twLifeListen{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-3px) rotate(2deg)}}
      @keyframes twLifeTalkBody{from{transform:translateY(0)}to{transform:translateY(-3px)}}
      @keyframes twLifeMouth{from{transform:scaleY(.72) scaleX(.92)}to{transform:scaleY(1.18) scaleX(1.08)}}
      @keyframes twLifeDance{from{transform:translate(-3px,-2px) rotate(-3deg)}to{transform:translate(3px,-6px) rotate(3deg)}}
    `;
    document.head.appendChild(style);
  }

  function wrapNativeCallbacks() {
    const previousTrackChanged = window.onNativeTrackChanged;
    window.onNativeTrackChanged = (uri, title, artist) => {
      if (typeof previousTrackChanged === 'function') previousTrackChanged(uri, title, artist);
      onTrackChanged(uri, title, artist);
    };

    const previousStarted = window.onNativePlaybackStarted;
    window.onNativePlaybackStarted = (...args) => {
      if (typeof previousStarted === 'function') previousStarted(...args);
      setMood('dance');
    };

    const previousPaused = window.onNativePlaybackPaused;
    window.onNativePlaybackPaused = (...args) => {
      if (typeof previousPaused === 'function') previousPaused(...args);
      setMood('calm');
    };
  }

  function init() {
    refreshSongs();
    installStyle();
    ensureBubble();
    bindManualChoices();
    watchSpeechBubble();
    wrapNativeCallbacks();
    setMood('idle');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
