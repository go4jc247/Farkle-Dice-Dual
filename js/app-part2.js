/* ---------------- background music: pre-baked seamless loop, fade-in on first touch ----------------
   The embedded musicData IS the final loop unit already -- crossfade already baked in at
   build time. The runtime does NOT re-slice it by loop points; it just plays exactly what's
   embedded. (An earlier version re-sliced using absolute timestamps that assumed a longer
   original track was embedded than actually was, which silently read out of bounds.) */
(function(){
  const NATIVE_SAMPLE_RATE = 48000;   // must match the baked file's rate to avoid resample seam artifacts
  const FADE_IN_SECONDS = 2.5;
  const TARGET_GAIN = 0.7;
  const LOOKAHEAD_COUNT = 4;          // how many repeats to always keep scheduled ahead of the playhead

  let started = false;

  // Don't depend on any single browser's native infinite-loop implementation being
  // reliable over long, unattended playback. Instead: manually schedule repeats of the
  // same buffer back-to-back at exact, pre-computed times, always several repeats ahead
  // of the current playhead. A single missed callback can never cause silence, because
  // the next several repeats are already scheduled well in advance.
  function startScheduledLoop(ctx, loopUnit, gainNode){
    const dur = loopUnit.duration;
    let nextStartTime = ctx.currentTime + 0.05;
    const scheduled = [];

    function scheduleOne(){
      const src = ctx.createBufferSource();
      src.buffer = loopUnit;
      src.connect(gainNode);
      src.start(nextStartTime);
      scheduled.push({src, startTime: nextStartTime});
      nextStartTime += dur;
    }

    for(let i=0;i<LOOKAHEAD_COUNT;i++) scheduleOne();

    const topUp = () => {
      while(scheduled.length && scheduled[0].startTime < ctx.currentTime - dur){
        scheduled.shift();
      }
      while(scheduled.length < LOOKAHEAD_COUNT){
        scheduleOne();
      }
    };
    const intervalMs = Math.max(1000, Math.min(15000, dur*1000/4));
    setInterval(topUp, intervalMs);

    return { get nextStartTime(){ return nextStartTime; }, scheduled };
  }

  // Mobile browsers routinely suspend an AudioContext (screen lock, backgrounding the
  // tab, power saving, iOS "interrupted" state from calls/notifications). This watchdog
  // resumes it whenever possible.
  function armResumeWatchdog(ctx){
    function tryResume(){
      if(ctx.state !== 'running'){
        ctx.resume().catch(()=>{});
      }
    }
    document.addEventListener('visibilitychange', () => { if(!document.hidden) tryResume(); });
    window.addEventListener('focus', tryResume);
    window.addEventListener('pageshow', tryResume);
    ctx.addEventListener('statechange', tryResume);
    document.addEventListener('pointerdown', tryResume, {capture:true});
    document.addEventListener('keydown', tryResume, {capture:true});
    setInterval(tryResume, 4000);
  }

  async function startMusic(){
    if(started) return;
    started = true;
    try{
      const musicEl = document.getElementById('musicData'); const b64 = musicEl ? musicEl.textContent.trim() : '';
      if(!b64) return; // no music embedded
      const ctx = new (window.AudioContext||window.webkitAudioContext)({sampleRate: NATIVE_SAMPLE_RATE});
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      const loopUnit = await ctx.decodeAudioData(bytes.buffer); // this buffer IS the final loop, already baked

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(TARGET_GAIN, ctx.currentTime+FADE_IN_SECONDS);
      gainNode.connect(ctx.destination);

      const loopHandle = startScheduledLoop(ctx, loopUnit, gainNode);
      armResumeWatchdog(ctx);

      window.__bgMusic = {ctx, gainNode, loopUnit, loopHandle};
      applyGain();   // in case volume/mute controls were touched before the music finished loading
    }catch(e){
      console.warn('background music failed to start:', e);
    }
  }

  // Volume controls: a stored preference that gets applied whenever the music is actually
  // running. Works even if pressed before the first roll (before decodeAudioData resolves) --
  // applyGain() is a safe no-op until window.__bgMusic exists, then gets re-applied once it does.
  let musicVolume = TARGET_GAIN, musicMuted = false;
  function applyGain(){
    const m = window.__bgMusic;
    if(!m) return;
    const target = musicMuted ? 0 : musicVolume;
    m.gainNode.gain.cancelScheduledValues(m.ctx.currentTime);
    m.gainNode.gain.linearRampToValueAtTime(target, m.ctx.currentTime+0.12);
  }
  function volStep(delta){
    musicVolume = Math.max(0, Math.min(1, musicVolume+delta));
    if(musicVolume>0) musicMuted = false;
    applyGain();
  }
  function toggleMute(){ musicMuted = !musicMuted; applyGain(); updateVolUI(); }
  function updateVolUI(){
    const el = document.getElementById('volctl');
    if(el) el.classList.toggle('muted', musicMuted);
  }
  window.__musicControls = {
    up: () => volStep(0.1),
    down: () => volStep(-0.1),
    toggleMute,
    getState: () => ({volume: musicVolume, muted: musicMuted}),
  };

  document.getElementById('volUp').addEventListener('click', (e)=>{ e.stopPropagation(); volStep(0.1); });
  document.getElementById('volDown').addEventListener('click', (e)=>{ e.stopPropagation(); volStep(-0.1); });
  document.getElementById('volMute').addEventListener('click', (e)=>{ e.stopPropagation(); toggleMute(); });

  // Browsers block audio until a user gesture. Start on the very first interaction anywhere on the page.
  document.addEventListener('pointerdown', startMusic, {once:true, capture:true});
  document.addEventListener('keydown', startMusic, {once:true, capture:true});

  window.__lf_startMusicNow = startMusic; // test hook
})();
