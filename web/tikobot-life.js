/* TikoBot — personnalité vivante, humeurs, visage animé et mémoire locale légère */
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
  let lastSong = null;
  let voiceActive = false;
  let lastAmbientAt = 0;

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

  function favoriteArtist() {
    const memory = readMemory();
    let best = null;
    Object.values(memory.artists || {}).forEach(entry => {
      if (!entry || !entry.name) return;
      if (!best || Number(entry.count || 0) > Number(best.count || 0)) best = entry;
    });
    return best;
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

  function facePaths() {
    const svg = $('.tikobot-character svg');
    if (!svg) return null;
    const paths = svg.querySelectorAll(':scope > path');
    if (paths.length < 3) return null;
    return {left:paths[0], right:paths[1], mouth:paths[2]};
  }

  function applyFace(mood) {
    const face = facePaths();
    if (!face) return;

    const faces = {
      idle: {
        left:'M70 65 Q82 50 94 65', right:'M126 65 Q138 50 150 65', mouth:'M88 82 Q110 100 132 82'
      },
      calm: {
        left:'M70 64 Q82 58 94 64', right:'M126 64 Q138 58 150 64', mouth:'M91 84 Q110 94 129 84'
      },
      happy: {
        left:'M69 66 Q82 48 95 66', right:'M125 66 Q138 48 151 66', mouth:'M84 80 Q110 104 136 80'
      },
      curious: {
        left:'M70 63 Q82 51 94 62', right:'M126 66 Q138 58 150 65', mouth:'M94 86 Q110 91 126 85'
      },
      surprised: {
        left:'M71 62 Q82 54 93 62', right:'M127 62 Q138 54 149 62', mouth:'M101 87 Q110 96 119 87 Q110 78 101 87'
      },
      listening: {
        left:'M69 64 Q82 50 95 64', right:'M125 64 Q138 50 151 64', mouth:'M96 86 Q110 90 124 86'
      },
      talking: {
        left:'M70 65 Q82 51 94 65', right:'M126 65 Q138 51 150 65', mouth:'M96 83 Q110 98 124 83'
      },
      dance: {
        left:'M68 66 Q82 47 96 66', right:'M124 66 Q138 47 152 66', mouth:'M84 80 Q110 105 136 80'
      }
    };

    const f = faces[mood] || faces.idle;
    face.left.setAttribute('d', f.left);
    face.right.setAttribute('d', f.right);
    face.mouth.setAttribute('d', f.mouth);
  }

  function updateMiniFace(mood) {
    const mini = $('#tikobotFab .tikobot-mini-face');
    if (!mini) return;
    const map = {
      idle:'◡', calm:'⌣', happy:'◠', curious:'◔', surprised:'⊙',
      listening:'◉', talking:'◡', dance:'◠'
    };
    mini.textContent = map[mood] || '◡';
  }

  function setMood(mood, duration = 0) {
    const next = mood || 'idle';
    const character = $('.tikobot-character');
    const fab = $('#tikobotFab');
    if (character) character.dataset.mood = next;
    if (fab) fab.dataset.mood = next;
    applyFace(next);
    updateMiniFace(next);
    document.dispatchEvent(new CustomEvent('tikobot:mood', {detail:{mood:next}}));

    if (moodTimer) clearTimeout(moodTimer);
    moodTimer = null;
    if (duration > 0 && !voiceActive) {
      moodTimer = setTimeout(() => setMood(isPlaying() ? 'dance' : 'idle'), duration);
    }
  }

  function isPlaying() {
    try {
      const state = JSON.parse(safeCall('getPlaybackState') || '{}');
      return !!state.playing;
    } catch (_) { return false; }
  }

  function speakReaction(song, before) {
    if (!song) return;
    const reaction = opinionFor(song, before || snapshotBefore(song));
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
    const before = snapshotBefore(song);
    const beforeUri = lastTrackUri;
    lastTrackUri = String(uri || '');
    lastSong = song;

    if (!beforeUri || beforeUri !== lastTrackUri) rememberSong(song);

    const manual = pendingManual;
    pendingManual = null;
    if (manual && Date.now() - manual.at < 3500) {
      const matches = !manual.uri || String(manual.uri) === String(uri || '');
      if (matches) speakReaction(song, before);
    }

    if (!voiceActive) setMood(isPlaying() ? 'dance' : 'calm');
  }

  function ambientThought() {
    const now = Date.now();
    if (now - lastAmbientAt < 90000) return;
    const sheet = $('#tikobotSheet');
    if (!sheet || sheet.hidden || voiceActive) return;

    const fav = favoriteArtist();
    const hour = new Date().getHours();
    let text = '';

    if (lastSong && isPlaying()) {
      const choices = [
        'Je garde le rythme avec toi.',
        `Je surveille la lecture de ${lastSong.title}.`,
        'Petit mode musique activé. Je reste dans le coin.'
      ];
      text = choices[Math.floor(Math.random() * choices.length)];
    } else if (fav && Number(fav.count || 0) >= 5) {
      text = `Je me souviens que tu écoutes souvent ${fav.name}.`;
    } else if (hour >= 22 || hour < 6) {
      text = 'Mode tranquille pour la soirée.';
    } else if (hour < 11) {
      text = 'Je suis réveillé. Prêt pour la musique.';
    } else {
      text = 'Je reste prêt si tu veux lancer quelque chose.';
    }

    lastAmbientAt = now;
    showBubble(text, 3200);
    setMood(isPlaying() ? 'dance' : 'curious', 1500);
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
        setTimeout(() => ambientThought(), 5200);
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
        if (voiceActive) setMood('talking');
        else setMood('talking', Math.min(3600, 900 + reply.textContent.length * 24));
      });
      observer.observe(reply, {childList:true, characterData:true, subtree:true});
    };
    attach();
    const bodyObserver = new MutationObserver(attach);
    bodyObserver.observe(document.body, {childList:true,subtree:true});
  }

  function scheduleIdleGesture() {
    if (idleTimer) clearTimeout(idleTimer);
    const delay = 5200 + Math.floor(Math.random() * 6200);
    idleTimer = setTimeout(() => {
      const sheet = $('#tikobotSheet');
      if (sheet && !sheet.hidden && !voiceActive) {
        const moods = isPlaying()
          ? ['dance','happy','curious','calm']
          : ['curious','calm','surprised','happy'];
        setMood(moods[Math.floor(Math.random() * moods.length)], 900 + Math.floor(Math.random() * 700));
        if (Math.random() < .28) ambientThought();
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
      .tikobot-character{position:relative;isolation:isolate}
      .tikobot-character::before{content:"";position:absolute;z-index:-1;left:50%;top:48%;width:118px;height:118px;border-radius:50%;transform:translate(-50%,-50%) scale(.88);background:radial-gradient(circle,rgba(255,49,76,.16),rgba(255,49,76,.03) 55%,transparent 72%);opacity:.42;transition:opacity .3s ease,transform .3s ease}
      .tikobot-character[data-mood="happy"]::before,.tikobot-character[data-mood="dance"]::before,.tikobot-character[data-mood="talking"]::before{opacity:.88;transform:translate(-50%,-50%) scale(1.08)}
      .tikobot-character svg > path:nth-of-type(1),.tikobot-character svg > path:nth-of-type(2){transform-box:fill-box;transform-origin:center;animation:twLifeBlink 5.4s infinite;transition:d .16s ease,stroke .18s ease}
      .tikobot-character svg > path:nth-of-type(3){transition:d .16s ease,stroke .18s ease}
      .tikobot-character svg > circle:last-of-type{transform-box:fill-box;transform-origin:center;animation:twGemIdle 2.8s ease-in-out infinite}
      .tikobot-character[data-mood="happy"]{animation:twLifeHappy .7s ease-in-out infinite alternate}
      .tikobot-character[data-mood="curious"]{animation:twLifeCurious 1.7s ease-in-out infinite}
      .tikobot-character[data-mood="surprised"]{animation:twLifeSurprise .7s ease-out}
      .tikobot-character[data-mood="listening"]{animation:twLifeListen 1.25s ease-in-out infinite}
      .tikobot-character[data-mood="talking"]{animation:twLifeTalkBody .52s ease-in-out infinite alternate}
      .tikobot-character[data-mood="talking"] svg > path:nth-of-type(3){transform-box:fill-box;transform-origin:center;animation:twLifeMouth .18s ease-in-out infinite alternate}
      .tikobot-character[data-mood="talking"] svg > circle:last-of-type,.tikobot-character[data-mood="listening"] svg > circle:last-of-type{animation:twGemTalk .48s ease-in-out infinite alternate}
      .tikobot-character[data-mood="dance"]{animation:twLifeDance .72s ease-in-out infinite alternate}
      .tikobot-character[data-mood="dance"] svg > circle:last-of-type{animation:twGemTalk .72s ease-in-out infinite alternate}
      .tikobot-character[data-mood="calm"]{animation:twRobotFloat 4.4s ease-in-out infinite}
      #tikobotFab[data-mood="listening"] .tikobot-mini-face,#tikobotFab[data-mood="talking"] .tikobot-mini-face{box-shadow:0 0 0 3px rgba(255,55,84,.12),0 0 16px rgba(255,55,84,.38)}
      #tikobotFab .tikobot-mini-face{transition:transform .18s ease,box-shadow .22s ease}
      #tikobotFab[data-mood="happy"] .tikobot-mini-face,#tikobotFab[data-mood="dance"] .tikobot-mini-face{transform:scale(1.08)}
      @keyframes twLifeBlink{0%,89%,93%,100%{transform:scaleY(1)}90.5%,91.5%{transform:scaleY(.08)}}
      @keyframes twLifeHappy{from{transform:translateY(0) rotate(-1deg)}to{transform:translateY(-5px) rotate(1deg)}}
      @keyframes twLifeCurious{0%,100%{transform:rotate(0)}35%{transform:rotate(-4deg)}70%{transform:rotate(3deg)}}
      @keyframes twLifeSurprise{0%{transform:scale(.94)}55%{transform:scale(1.06)}100%{transform:scale(1)}}
      @keyframes twLifeListen{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-3px) rotate(2deg)}}
      @keyframes twLifeTalkBody{from{transform:translateY(0)}to{transform:translateY(-3px)}}
      @keyframes twLifeMouth{from{transform:scaleY(.58) scaleX(.92)}to{transform:scaleY(1.32) scaleX(1.08)}}
      @keyframes twLifeDance{from{transform:translate(-3px,-2px) rotate(-3deg)}to{transform:translate(3px,-6px) rotate(3deg)}}
      @keyframes twGemIdle{0%,100%{transform:scale(1);filter:brightness(1)}50%{transform:scale(1.05);filter:brightness(1.16)}}
      @keyframes twGemTalk{from{transform:scale(.92);filter:brightness(.9)}to{transform:scale(1.18);filter:brightness(1.45)}}
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
      if (!voiceActive) setMood('dance');
    };

    const previousPaused = window.onNativePlaybackPaused;
    window.onNativePlaybackPaused = (...args) => {
      if (typeof previousPaused === 'function') previousPaused(...args);
      if (!voiceActive) setMood('calm');
    };

    const previousVoiceStart = window.onTikoBotVoiceStart;
    window.onTikoBotVoiceStart = (...args) => {
      if (typeof previousVoiceStart === 'function') previousVoiceStart(...args);
      voiceActive = true;
      setMood('talking');
    };

    const previousVoiceEnd = window.onTikoBotVoiceEnd;
    window.onTikoBotVoiceEnd = (...args) => {
      if (typeof previousVoiceEnd === 'function') previousVoiceEnd(...args);
      voiceActive = false;
      setMood(isPlaying() ? 'dance' : 'calm', 1000);
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
