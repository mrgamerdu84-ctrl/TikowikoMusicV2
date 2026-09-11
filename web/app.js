/* tikoWiko Musique — vrai lecteur Android local */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const A = window.Android || null;
  const COVERS = ['gold-a.jpg','gold-b.jpg','gold-c.jpg','gold-d.jpg','cover-a.jpg','cover-b.jpg','cover-c.jpg','cover-d.jpg','cover-e.jpg'];

  let songs = [];
  let current = -1;
  let playing = false;
  let libView = 'titres';
  let libQuery = '';
  let shuffle = JSON.parse(localStorage.getItem('tw_shuffle') || 'false');
  let repeat = localStorage.getItem('tw_repeat') || 'off';
  let volume = Number(localStorage.getItem('tw_volume') || 78);
  let focusMode = localStorage.getItem('tw_focus') || 'pause';
  let audioMode = localStorage.getItem('tw_audio_mode') || 'classic';
  let pauseOnUnplug = JSON.parse(localStorage.getItem('tw_noisy') || 'true');
  let normalize = JSON.parse(localStorage.getItem('tw_normalize') || 'true');
  let autoScan = JSON.parse(localStorage.getItem('tw_autoscan') || 'true');
  let backgroundPlayback = JSON.parse(localStorage.getItem('tw_background') || 'true');
  let favorites = new Set(JSON.parse(localStorage.getItem('tw_favorites') || '[]'));
  let playlists = JSON.parse(localStorage.getItem('tw_playlists') || '[]');
  let queue = [];
  let toastTimer = null;

  const TAB_OF = { player:'player', library:'library', playlists:'playlists', settings:'settings', focus:'settings', queue:'settings', output:'settings' };

  function safeCall(name, ...args) {
    try { return A && typeof A[name] === 'function' ? A[name](...args) : null; }
    catch (e) { return null; }
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function coverFor(i) { return COVERS[Math.abs(i) % COVERS.length]; }
  function fmt(ms) {
    ms = Math.max(0, Number(ms) || 0);
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), r = s % 60;
    return `${m}:${String(r).padStart(2,'0')}`;
  }

  function toast(text) {
    let el = $('.toast');
    if (!el) {
      el = document.createElement('div'); el.className = 'toast';
      $('.phone-screen').appendChild(el);
    }
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 1900);
  }

  function show(name) {
    $$('.screen').forEach(s => s.classList.toggle('is-active', s.dataset.screen === name));
    const tab = TAB_OF[name] || 'player';
    $$('.nav-item').forEach(b => b.classList.toggle('is-on', b.dataset.go === tab));
    updateMiniplayer();
  }

  function injectPermissionCard() {
    if ($('#permissionCard')) return;
    const scan = $('.screen[data-screen="library"] .scan');
    if (!scan) return;
    const card = document.createElement('div');
    card.id = 'permissionCard';
    card.className = 'permission-card';
    card.hidden = true;
    card.innerHTML = '<strong>Ta musique sur ce téléphone</strong><span>Autorise tikoWiko Musique à lire les fichiers audio enregistrés sur Android.</span><button id="grantMusic">Autoriser l’accès à ma musique</button>';
    scan.after(card);
    $('#grantMusic').addEventListener('click', () => safeCall('requestAudioPermission'));
  }

  function loadLibrary() {
    injectPermissionCard();
    if (!A) {
      $('#permissionCard').hidden = false;
      $('#permissionCard span').textContent = 'Le scan réel fonctionne dans l’APK Android.';
      $('#grantMusic').hidden = true;
      return;
    }
    if (!safeCall('hasAudioPermission')) {
      $('#permissionCard').hidden = false;
      $('#grantMusic').hidden = false;
      songs = []; renderLibrary(); renderQueue();
      return;
    }
    $('#permissionCard').hidden = true;
    try { songs = JSON.parse(safeCall('getSongs') || '[]'); }
    catch (e) { songs = []; }
    songs.forEach((s, i) => {
      s.title = s.title || 'Sans titre'; s.artist = s.artist || 'Artiste inconnu'; s.album = s.album || 'Album inconnu';
      s.duration = Number(s.duration) || 0; s.folder = s.folder || 'Musique'; s.cover = coverFor(i);
    });
    const code = $('.scan code');
    if (code) code.textContent = 'Bibliothèque audio Android · MediaStore';
    const bar = $('.scan-bar i'); if (bar) bar.style.width = '100%';
    renderLibrary(); renderPlaylists(); renderQueue();
    toast(songs.length ? `${songs.length} titre${songs.length > 1 ? 's' : ''} trouvé${songs.length > 1 ? 's' : ''}` : 'Aucune musique trouvée');
  }

  window.onAudioPermissionResult = ok => {
    if (ok) loadLibrary(); else toast('Autorisation refusée');
  };

  function matches(s) {
    const q = libQuery.trim().toLowerCase();
    return !q || [s.title,s.artist,s.album,s.folder].join(' ').toLowerCase().includes(q);
  }

  function renderLibrary() {
    const list = $('#libList'); if (!list) return;
    const hits = songs.map((s,i)=>({s,i})).filter(x=>matches(x.s));
    $('#libCount').textContent = `${hits.length} titre${hits.length !== 1 ? 's' : ''}`;
    if (!hits.length) {
      list.innerHTML = `<li class="list-empty">${songs.length ? 'Aucun résultat' : 'Aucune musique disponible'}<span>${songs.length ? 'Essaie une autre recherche.' : 'Autorise l’accès puis ajoute des fichiers MP3, FLAC, M4A ou OPUS sur ton téléphone.'}</span></li>`;
      return;
    }
    if (libView === 'titres') {
      list.innerHTML = hits.map(({s,i}) => `<li class="row${i===current?' is-playing':''}" data-track="${i}" tabindex="0" role="button">
        <img class="mini" src="${s.cover}" alt="" width="38" height="38" />
        <div class="row-txt"><strong>${esc(s.title)}</strong><span>${esc(s.artist)} · ${esc((s.mime||'audio').replace('audio/','').toUpperCase())}</span></div>
        ${i===current && playing ? '<span class="eq-mini"><i></i><i></i><i></i></span>' : `<span class="dur">${fmt(s.duration)}</span>`}
      </li>`).join('');
    } else {
      const key = libView === 'albums' ? 'album' : libView === 'artistes' ? 'artist' : 'folder';
      const groups = new Map();
      hits.forEach(({s,i}) => { const k = s[key] || 'Inconnu'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push({s,i}); });
      list.innerHTML = [...groups.entries()].map(([name,items]) => `<li class="row grp" data-track="${items[0].i}" tabindex="0" role="button">
        <img class="mini" src="${items[0].s.cover}" alt="" width="38" height="38" />
        <div class="row-txt"><strong>${esc(name)}</strong><span>${items.length} titre${items.length>1?'s':''}${libView==='albums'?' · '+esc(items[0].s.artist):''}</span></div>
        <svg class="row-go" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
      </li>`).join('');
    }
    $$('[data-track]', list).forEach(li => {
      const go = () => playTrack(Number(li.dataset.track));
      li.addEventListener('click', go); li.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); go(); } });
    });
  }

  function updateMeta() {
    const s = songs[current];
    if (!s) {
      $('#trackTitle').textContent = 'Choisis une musique';
      $('#trackArtist').textContent = 'Bibliothèque locale';
      $('#trackFmt').textContent = 'hors ligne';
      $('#tCur').textContent = '0:00'; $('#tTot').textContent = '0:00';
      $('#playBtn').disabled = true;
      return;
    }
    $('#playBtn').disabled = false;
    $('#coverImg').src = s.cover; $('#coverImg').alt = `Pochette pour ${s.title}`;
    $('#trackTitle').textContent = s.title; $('#trackArtist').textContent = s.artist;
    $('#trackFmt').textContent = `${(s.mime||'audio').replace('audio/','').toUpperCase()} · local`;
    $('#tTot').textContent = fmt(s.duration);
    $('#miniCover').src = s.cover; $('#miniTitle').textContent = s.title;
    $('#npCover').src = s.cover; $('#npTitle').textContent = s.title; $('#npArtist').textContent = `${s.artist} · en cours`;
    $('#likeBtn').setAttribute('aria-pressed', String(favorites.has(s.uri)));
  }

  function setPlayIcon(on) {
    playing = !!on;
    const p = on ? '<path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z"/>' : '<path d="M8 5v14l11-7z"/>';
    $('#playIcon').innerHTML = p; $('#miniIcon').innerHTML = p;
    $('#playBtn').setAttribute('aria-label', on ? 'Pause' : 'Lecture');
    $('#miniPlay').setAttribute('aria-label', on ? 'Pause' : 'Lecture');
    $('#cover').classList.toggle('is-paused', !on);
    $('#coverEq').classList.toggle('is-off', !on);
    updateMiniplayer(); renderLibrary();
  }

  function playTrack(i) {
    if (!songs[i]) return;
    current = i;
    const s = songs[i];
    safeCall('play', s.uri, s.title, s.artist);
    setPlayIcon(true); updateMeta(); buildDefaultQueue(); renderQueue(); renderLibrary(); show('player');
  }

  function togglePlay() {
    if (current < 0) { if (songs.length) playTrack(0); else { show('library'); toast('Ajoute ou autorise tes musiques'); } return; }
    if (playing) safeCall('pause'); else safeCall('resume');
    setPlayIcon(!playing);
  }

  function nextTrack(fromEnd = false) {
    if (!songs.length) return;
    if (repeat === 'one' && fromEnd) return playTrack(current);
    let i;
    if (shuffle && songs.length > 1) do { i = Math.floor(Math.random()*songs.length); } while (i === current);
    else i = current < 0 ? 0 : current + 1;
    if (i >= songs.length) {
      if (repeat === 'all') i = 0; else { setPlayIcon(false); return; }
    }
    playTrack(i);
  }

  function prevTrack() {
    if (!songs.length) return;
    let i = current <= 0 ? (repeat === 'all' ? songs.length - 1 : 0) : current - 1;
    playTrack(i);
  }

  window.onNativeTrackEnded = () => nextTrack(true);
  window.onNativePlaybackStarted = () => setPlayIcon(true);
  window.onNativePlaybackPaused = () => setPlayIcon(false);
  window.onNativePlaybackError = () => { setPlayIcon(false); toast('Impossible de lire ce fichier'); };

  function buildDefaultQueue() {
    queue = songs.map((_,i)=>i).filter(i=>i!==current);
  }

  function renderQueue() {
    const list = $('#queueList'); if (!list) return;
    if (!queue.length) buildDefaultQueue();
    const order = queue.slice(0, 30);
    list.innerHTML = order.map(i => {
      const s = songs[i]; if (!s) return '';
      return `<li class="row" data-q="${i}" tabindex="0" role="button"><span class="grip"><i></i><i></i><i></i></span><img class="mini" src="${s.cover}" alt="" width="38" height="38"/><div class="row-txt"><strong>${esc(s.title)}</strong><span>${esc(s.artist)}</span></div><span class="dur">${fmt(s.duration)}</span></li>`;
    }).join('');
    const ql = $('.screen[data-screen="queue"] .q-label'); if (ql) ql.textContent = `À suivre — ${order.length} titre${order.length!==1?'s':''}`;
    $$('[data-q]', list).forEach(li => li.addEventListener('click', () => playTrack(Number(li.dataset.q))));
  }

  function persistPlaylists() { localStorage.setItem('tw_playlists', JSON.stringify(playlists)); }
  function renderPlaylists() {
    const list = $('#plList'); if (!list) return;
    if (!playlists.length) {
      list.innerHTML = '<li class="list-empty">Aucune playlist<span>Appuie sur + pour créer ta première playlist locale.</span></li>';
    } else {
      list.innerHTML = playlists.map((p,i) => {
        const ids = p.uris.map(u=>songs.findIndex(s=>s.uri===u)).filter(x=>x>=0);
        const cov = ids.length ? songs[ids[0]].cover : 'gold-a.jpg';
        return `<li class="row" data-pl="${i}" tabindex="0" role="button"><img class="mini big" src="${cov}" alt="" width="46" height="46"/><div class="row-txt"><strong>${esc(p.name)}</strong><span>${ids.length} titre${ids.length!==1?'s':''} · stockée sur ce téléphone</span></div><svg class="row-go" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></li>`;
      }).join('');
      $$('[data-pl]', list).forEach(li => li.addEventListener('click', () => {
        const p = playlists[Number(li.dataset.pl)];
        const ids = p.uris.map(u=>songs.findIndex(s=>s.uri===u)).filter(x=>x>=0);
        if (!ids.length) return toast('Cette playlist ne contient aucun titre disponible');
        queue = ids.slice(1); playTrack(ids[0]); queue = ids.slice(1); renderQueue();
      }));
    }
    const hint = $('#plHint .row-txt span'); if (hint) hint.textContent = `${playlists.length} playlist${playlists.length!==1?'s':''} · sauvegardée${playlists.length!==1?'s':''} localement`;
  }

  function createPlaylist() {
    const name = prompt('Nom de la playlist :', 'Ma playlist');
    if (!name || !name.trim()) return;
    const uris = current >= 0 && songs[current] ? [songs[current].uri] : [];
    playlists.push({name:name.trim(), uris}); persistPlaylists(); renderPlaylists();
    toast(current >= 0 ? 'Playlist créée avec le titre en cours' : 'Playlist créée');
  }

  function renderModes() {
    const modes = [
      ['classic','Classique'], ['vinyl','Vinyle'], ['bass','Basses+'], ['night','Nuit'], ['stage','Scène']
    ];
    $('#modeRow').innerHTML = modes.map(([k,l]) => `<button class="mode${audioMode===k?' is-on':''}" data-mode="${k}" aria-pressed="${audioMode===k}">${l}</button>`).join('');
    $('#modeDots').innerHTML = modes.map(([k])=>`<i class="${audioMode===k?'is-on':''}"></i>`).join('');
    $$('#modeRow [data-mode]').forEach(b => b.addEventListener('click', () => {
      audioMode = b.dataset.mode; localStorage.setItem('tw_audio_mode',audioMode); safeCall('setAudioMode',audioMode); renderModes();
      toast(b.textContent + ' activé');
    }));
  }

  function renderFocus() {
    const profiles = [
      ['maison','Maison','pause'], ['ecouteurs','Écouteurs','duck'], ['voiture','Voiture','duck'], ['jeu','Jeu','keep'], ['concentre','Discret','pause']
    ];
    const active = localStorage.getItem('tw_focus_profile') || 'maison';
    $('#profiles').innerHTML = profiles.map(([k,l,m]) => `<button class="profile" data-profile="${k}" data-mode="${m}" aria-pressed="${k===active}">${l}</button>`).join('');
    $$('#profiles .profile').forEach(b => b.addEventListener('click', () => {
      localStorage.setItem('tw_focus_profile', b.dataset.profile); focusMode = b.dataset.mode; localStorage.setItem('tw_focus',focusMode); safeCall('setFocusMode',focusMode); renderFocus(); syncSettings();
    }));
    const opts = [
      ['pause','Pause','Met la musique en pause et reprend ensuite'],
      ['duck','Baisser','Réduit la musique pendant l’autre son'],
      ['keep','Continuer','Essaie de maintenir la lecture']
    ];
    $('#rulesList').innerHTML = opts.map(([k,l,d]) => `<div class="rule"><div class="rule-head"><div class="row-txt"><strong>${l}</strong><span>${d}</span></div></div><div class="seg"><button data-focus="${k}" aria-pressed="${focusMode===k}">${focusMode===k?'Actif':'Choisir'}</button></div></div>`).join('');
    $$('#rulesList [data-focus]').forEach(b => b.addEventListener('click', () => {
      focusMode=b.dataset.focus; localStorage.setItem('tw_focus',focusMode); localStorage.setItem('tw_focus_profile','personnalise'); safeCall('setFocusMode',focusMode); renderFocus(); syncSettings();
    }));
    $('#focusChipText').textContent = `Focus audio · ${focusMode==='pause'?'pause':focusMode==='duck'?'volume baissé':'lecture maintenue'}`;
    const eh = $('.exc-head strong'); if (eh) eh.textContent = 'Comportement Android';
    const ec = $('#excCount'); if (ec) ec.textContent = 'global';
    const help = $('.exc-help'); if (help) help.textContent = 'Android ne donne pas toujours l’identité de l’application qui prend le son. Ce choix s’applique donc aux autres applications de façon globale.';
    const ex = $('#excList'); if (ex) ex.innerHTML = '<li class="row"><div class="row-txt"><strong>Focus système</strong><span>Politique réelle appliquée par le lecteur Android</span></div></li>';
  }

  function renderOutputs() {
    const host = $('.out-list'); if (!host) return;
    let outs=[]; try { outs=JSON.parse(safeCall('getAudioOutputs') || '[]'); } catch(e) {}
    if (!outs.length) outs=[{name:'Sortie audio Android',type:'Détection système'}];
    host.innerHTML = outs.slice(0,8).map((o,i)=>`<div class="out${i===0?' is-on':''}"><span class="out-ic">♫</span><div class="row-txt"><strong>${esc(o.name)}</strong><span>${esc(o.type)} · disponible</span></div>${i===0?'<span class="out-check">✓</span>':''}</div>`).join('');
    $('#setOutVal').textContent = outs[0].name;
  }

  function syncSettings() {
    const names={pause:'Pause',duck:'Baisser',keep:'Continuer'}; $('#setFocusVal').textContent = names[focusMode] || 'Pause';
    const sets = $$('.screen[data-screen="settings"] .switch-row .sw');
    if (sets[0]) setSwitch(sets[0], backgroundPlayback); if (sets[1]) setSwitch(sets[1], autoScan); if (sets[2]) setSwitch(sets[2], true);
    const outs = $$('.screen[data-screen="output"] .switch-row .sw');
    if (outs[0]) setSwitch(outs[0], pauseOnUnplug); if (outs[1]) setSwitch(outs[1], normalize);
    if (outs[2]) { const span=outs[2].previousElementSibling?.querySelector('span'); if (span) span.textContent='Géré par Android selon la sortie'; }
  }

  function setSwitch(el,on){ el.classList.toggle('is-on',!!on); el.setAttribute('aria-checked',String(!!on)); }

  function updateMiniplayer() {
    const active = $('.screen.is-active')?.dataset.screen;
    $('#miniplayer').hidden = active === 'player' || current < 0;
    $('#miniState').textContent = playing ? `Lecture · ${volume} %` : 'En pause';
  }

  function bindUI() {
    $$('.nav-item').forEach(b=>b.addEventListener('click',()=>show(b.dataset.go)));
    $$('[data-go-screen]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.goScreen)));
    $('#menuBtn')?.addEventListener('click',()=>show('settings'));
    $('#playBtn')?.addEventListener('click',togglePlay); $('#miniPlay')?.addEventListener('click',togglePlay);

    const controls = $$('.controls .icon-btn');
    controls[0]?.addEventListener('click',()=>{ shuffle=!shuffle; localStorage.setItem('tw_shuffle',JSON.stringify(shuffle)); controls[0].classList.toggle('is-on',shuffle); toast(shuffle?'Aléatoire activé':'Aléatoire désactivé'); });
    controls[1]?.addEventListener('click',prevTrack);
    controls[2]?.addEventListener('click',nextTrack);
    controls[3]?.addEventListener('click',()=>{ repeat = repeat==='off'?'all':repeat==='all'?'one':'off'; localStorage.setItem('tw_repeat',repeat); controls[3].classList.toggle('is-on',repeat!=='off'); toast(repeat==='one'?'Répéter ce titre':repeat==='all'?'Répéter la bibliothèque':'Répétition désactivée'); });
    controls[0]?.classList.toggle('is-on',shuffle); controls[3]?.classList.toggle('is-on',repeat!=='off');

    $('#likeBtn')?.addEventListener('click',()=>{
      const s=songs[current]; if(!s) return;
      if(favorites.has(s.uri)) favorites.delete(s.uri); else favorites.add(s.uri);
      localStorage.setItem('tw_favorites',JSON.stringify([...favorites])); $('#likeBtn').setAttribute('aria-pressed',String(favorites.has(s.uri)));
      toast(favorites.has(s.uri)?'Ajouté aux favoris':'Retiré des favoris');
    });

    $$('#libViews .chip').forEach(c=>c.addEventListener('click',()=>{
      libView=c.dataset.view; $$('#libViews .chip').forEach(x=>{ const on=x===c; x.classList.toggle('is-on',on); x.setAttribute('aria-pressed',String(on)); }); renderLibrary();
    }));
    $('#searchBtn')?.addEventListener('click',()=>{ show('library'); const w=$('#searchWrap'); w.hidden=!w.hidden; if(!w.hidden) $('#searchInput').focus(); });
    $('#searchInput')?.addEventListener('input',e=>{libQuery=e.target.value;renderLibrary();});
    $('#searchClear')?.addEventListener('click',()=>{$('#searchInput').value='';libQuery='';renderLibrary();});
    $('#newPl')?.addEventListener('click',createPlaylist);

    $('.seek-bar')?.addEventListener('click',e=>{
      if(current<0)return; const r=e.currentTarget.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); const dur=songs[current]?.duration||0; safeCall('seekTo',Math.round(dur*p));
    });
    $('.vol-bar')?.addEventListener('click',e=>{
      const r=e.currentTarget.getBoundingClientRect(); volume=Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*100); localStorage.setItem('tw_volume',volume); safeCall('setVolume',volume); updateVolumeUI();
    });

    const settingsRows = $$('.screen[data-screen="settings"] .switch-row');
    settingsRows[0]?.addEventListener('click',()=>{backgroundPlayback=!backgroundPlayback;localStorage.setItem('tw_background',JSON.stringify(backgroundPlayback));syncSettings();});
    settingsRows[1]?.addEventListener('click',()=>{autoScan=!autoScan;localStorage.setItem('tw_autoscan',JSON.stringify(autoScan));syncSettings();});
    settingsRows[2]?.addEventListener('click',()=>toast('Le thème noir & or reste actif'));

    const outputRows = $$('.screen[data-screen="output"] .switch-row');
    outputRows[0]?.addEventListener('click',()=>{pauseOnUnplug=!pauseOnUnplug;localStorage.setItem('tw_noisy',JSON.stringify(pauseOnUnplug));safeCall('setPauseOnUnplug',pauseOnUnplug);syncSettings();});
    outputRows[1]?.addEventListener('click',()=>{normalize=!normalize;localStorage.setItem('tw_normalize',JSON.stringify(normalize));safeCall('setNormalization',normalize);syncSettings();});
    outputRows[2]?.addEventListener('click',()=>toast('Le mono dépend des réglages audio Android'));

    $$('#sleepChips .chip').forEach(b=>b.addEventListener('click',()=>{
      const txt=b.textContent.trim(); const v=txt.startsWith('15')?'15':txt.startsWith('30')?'30':txt.startsWith('Fin')?'end':'off';
      $$('#sleepChips .chip').forEach(x=>x.classList.toggle('is-on',x===b)); safeCall('setSleepTimer',v); toast(v==='off'?'Minuteur désactivé':v==='end'?'Arrêt à la fin du titre':`Arrêt dans ${v} min`);
    }));

    $$('#fadeChips .chip').forEach(b=>b.addEventListener('click',()=>{$$('#fadeChips .chip').forEach(x=>x.classList.toggle('is-on',x===b)); toast(`Fondu ${b.textContent.trim()}`);}));

    document.addEventListener('visibilitychange',()=>{
      if(document.hidden && !backgroundPlayback && playing){safeCall('pause');setPlayIcon(false);}
      if(!document.hidden && autoScan) loadLibrary();
    });
  }

  function updateVolumeUI(){ $('#volVal').textContent=volume; $('#volFill').style.width=`${volume}%`; safeCall('setVolume',volume); }

  function pollNative() {
    if(!A)return;
    try {
      const st=JSON.parse(safeCall('getPlaybackState')||'{}');
      if(current>=0){
        const dur=Number(st.duration)||songs[current]?.duration||0; const pos=Number(st.position)||0; const pct=dur?Math.max(0,Math.min(100,pos/dur*100)):0;
        $('#seekFill').style.width=`${pct}%`; $('#seekKnob').style.left=`${pct}%`; $('#tCur').textContent=fmt(pos); $('#tTot').textContent=fmt(dur);
      }
      if(typeof st.playing==='boolean' && st.playing!==playing) setPlayIcon(st.playing);
    } catch(e) {}
  }

  function init() {
    bindUI(); renderModes(); renderFocus(); renderOutputs(); renderPlaylists(); syncSettings(); updateVolumeUI(); updateMeta();
    safeCall('setFocusMode',focusMode); safeCall('setAudioMode',audioMode); safeCall('setPauseOnUnplug',pauseOnUnplug); safeCall('setNormalization',normalize);
    loadLibrary();
    setInterval(pollNative,500);
    const foot=$('.set-foot'); if(foot) foot.innerHTML='tikoWiko Musique 1.5 · Lecteur local Android<br>© 2026 tikoWikoFamily';
    const scanNote=$('.scan-note'); if(scanNote) scanNote.textContent='100 % hors ligne';
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
