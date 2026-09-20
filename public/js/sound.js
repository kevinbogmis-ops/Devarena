// ==========================================================================
// DEVARENA AUDIO ENGINE v2 - Synthétiseur Néon Arcade (Web Audio API, sans fichier)
// Chaîne maître compressée, oscillateurs + bruit percussif, tension du chrono,
// jingles dédiés par joker. API rétro-compatible (playClick, playTick, ...).
// ==========================================================================

class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = localStorage.getItem('devarena_muted') === 'true';

    // Musique de fond
    this.musicWanted = false;      // la page souhaite de la musique (survit au mute)
    this.musicTimer = null;        // interval de planification
    this.musicGain = null;         // volume dédié musique
    this.musicNextLoopTime = 0;
    this._gestureHookInstalled = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        // Chaîne maître : compresseur pour donner du corps et éviter la saturation
        this.master = this.ctx.createDynamicsCompressor();
        this.master.threshold.value = -18;
        this.master.ratio.value = 6;
        this.master.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  ready() {
    if (this.muted) return false;
    this.init();
    return !!this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('devarena_muted', this.muted);
    if (this.muted) {
      this._haltMusic();
    } else if (this.musicWanted) {
      this.startMusic();
    }
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  // --- Briques de synthèse ---

  // Un oscillateur avec enveloppe. slideTo : glissement de fréquence.
  tone({ type = 'square', freq = 440, slideTo = null, at = 0, dur = 0.1, vol = 0.2 }) {
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    }

    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Burst de bruit blanc filtré (percussions, glitchs, impacts)
  noise({ at = 0, dur = 0.15, vol = 0.25, filterFreq = 1200, filterType = 'bandpass' }) {
    const t0 = this.ctx.currentTime + at;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // --- Sons d'interface ---

  // Clic mécanique : transitoire de bruit + corps grave
  playClick() {
    if (!this.ready()) return;
    this.noise({ dur: 0.03, vol: 0.12, filterFreq: 3200 });
    this.tone({ type: 'triangle', freq: 190, slideTo: 45, dur: 0.05, vol: 0.25 });
  }

  // Verrouillage de réponse : double blip de confirmation
  playLock() {
    if (!this.ready()) return;
    this.tone({ type: 'square', freq: 660, dur: 0.06, vol: 0.14 });
    this.tone({ type: 'square', freq: 990, at: 0.07, dur: 0.09, vol: 0.14 });
  }

  // Tick du chrono : monte en fréquence et en intensité quand le temps file
  playTick(remainingSec = null) {
    if (!this.ready()) return;
    if (remainingSec !== null && remainingSec <= 5) {
      // Zone rouge : tick aigu + pouls grave, la tension monte à chaque seconde
      const urgency = Math.max(0, 5 - remainingSec); // 0..4
      this.tone({ type: 'square', freq: 660 + urgency * 90, dur: 0.07, vol: 0.16 });
      this.tone({ type: 'sine', freq: 110, dur: 0.1, vol: 0.2 });
    } else {
      this.tone({ type: 'square', freq: 440, dur: 0.05, vol: 0.09 });
    }
  }

  // Arrivée d'un joueur dans le lobby : blip radar
  playJoin() {
    if (!this.ready()) return;
    this.tone({ type: 'sine', freq: 520, slideTo: 1040, dur: 0.12, vol: 0.14 });
    this.tone({ type: 'sine', freq: 1560, at: 0.12, dur: 0.1, vol: 0.08 });
  }

  // --- Sons de jeu ---

  // Bonne réponse : accord majeur montant, doublé d'une octave scintillante
  playCorrect() {
    if (!this.ready()) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, idx) => {
      this.tone({ type: 'triangle', freq, at: idx * 0.07, dur: 0.22, vol: 0.18 });
      this.tone({ type: 'sine', freq: freq * 2, at: idx * 0.07, dur: 0.18, vol: 0.05 });
    });
  }

  // Mauvaise réponse : buzzer descendant + impact sourd
  playWrong() {
    if (!this.ready()) return;
    this.tone({ type: 'sawtooth', freq: 220, slideTo: 92, dur: 0.32, vol: 0.2 });
    this.noise({ dur: 0.12, vol: 0.1, filterFreq: 300, filterType: 'lowpass' });
  }

  // Roulement de tambour avant la révélation de la bonne réponse
  playReveal() {
    if (!this.ready()) return;
    for (let i = 0; i < 8; i++) {
      this.noise({ at: i * 0.07, dur: 0.05, vol: 0.1 + i * 0.012, filterFreq: 900 });
    }
    // Cymbale de résolution
    this.noise({ at: 0.58, dur: 0.3, vol: 0.14, filterFreq: 6500, filterType: 'highpass' });
  }

  // Fanfare de victoire : mélodie 8-bit + basse + crash
  playVictory() {
    if (!this.ready()) return;
    const melody = [
      { f: 523.25, at: 0, d: 0.14 },
      { f: 659.25, at: 0.14, d: 0.14 },
      { f: 783.99, at: 0.28, d: 0.14 },
      { f: 1046.5, at: 0.42, d: 0.38 },
      { f: 783.99, at: 0.8, d: 0.12 },
      { f: 1046.5, at: 0.92, d: 0.55 }
    ];
    melody.forEach(n => {
      this.tone({ type: 'square', freq: n.f, at: n.at, dur: n.d, vol: 0.16 });
    });
    // Ligne de basse
    [130.81, 164.81, 196, 261.63].forEach((f, i) => {
      this.tone({ type: 'triangle', freq: f, at: i * 0.14, dur: 0.16, vol: 0.2 });
    });
    this.noise({ at: 0.92, dur: 0.45, vol: 0.12, filterFreq: 7000, filterType: 'highpass' });
  }

  // --- Sons de jokers ---

  // Activation d'un joker : jingle propre à chacun
  playJokerActivate(jokerId) {
    if (!this.ready()) return;
    switch (jokerId) {
      case 'fifty': // 🎯 deux options qui s'éteignent
        this.tone({ type: 'square', freq: 880, slideTo: 440, dur: 0.12, vol: 0.15 });
        this.tone({ type: 'square', freq: 880, slideTo: 440, at: 0.15, dur: 0.12, vol: 0.15 });
        break;
      case 'shield': // 🛡️ nappe protectrice
        this.tone({ type: 'sine', freq: 330, slideTo: 660, dur: 0.35, vol: 0.16 });
        this.tone({ type: 'sine', freq: 495, slideTo: 990, dur: 0.35, vol: 0.1 });
        break;
      case 'boost': // 🚀 décollage
        this.tone({ type: 'sawtooth', freq: 220, slideTo: 1320, dur: 0.4, vol: 0.14 });
        this.noise({ dur: 0.35, vol: 0.08, filterFreq: 2200, filterType: 'highpass' });
        break;
      case 'ddos': // 💥 charge électrique envoyée
        this.noise({ dur: 0.2, vol: 0.2, filterFreq: 1600 });
        this.tone({ type: 'sawtooth', freq: 1200, slideTo: 200, dur: 0.25, vol: 0.14 });
        break;
      case 'rot13': // 🕵️ brouillage mystérieux
        this.tone({ type: 'triangle', freq: 620, slideTo: 340, dur: 0.14, vol: 0.13 });
        this.tone({ type: 'triangle', freq: 340, slideTo: 620, at: 0.15, dur: 0.14, vol: 0.13 });
        this.tone({ type: 'triangle', freq: 480, at: 0.31, dur: 0.16, vol: 0.13 });
        break;
      case 'steal': // 💰 ka-ching de pièces
        this.tone({ type: 'square', freq: 1318.5, dur: 0.09, vol: 0.14 });
        this.tone({ type: 'square', freq: 1567.98, at: 0.1, dur: 0.2, vol: 0.14 });
        this.tone({ type: 'sine', freq: 2637, at: 0.1, dur: 0.18, vol: 0.07 });
        break;
      default:
        this.playCorrect();
    }
  }

  // Subir une attaque : impact selon le type
  playAttacked(type) {
    if (!this.ready()) return;
    switch (type) {
      case 'ddos': // écran qui glitche
        for (let i = 0; i < 4; i++) {
          this.noise({ at: i * 0.09, dur: 0.07, vol: 0.16, filterFreq: 500 + Math.random() * 2500 });
        }
        this.tone({ type: 'sawtooth', freq: 150, slideTo: 55, dur: 0.4, vol: 0.18 });
        break;
      case 'rot13': // interférence chiffrée
        this.tone({ type: 'square', freq: 840, slideTo: 260, dur: 0.3, vol: 0.12 });
        this.noise({ dur: 0.25, vol: 0.08, filterFreq: 3000 });
        break;
      case 'steal': // pièces qui s'envolent (ka-ching inversé)
        this.tone({ type: 'square', freq: 1567.98, slideTo: 780, dur: 0.18, vol: 0.14 });
        this.tone({ type: 'square', freq: 1318.5, slideTo: 660, at: 0.16, dur: 0.22, vol: 0.12 });
        break;
      default:
        this.playWrong();
    }
  }

  // ==========================================================================
  // MUSIQUE DE FOND CHIPTUNE — boucle arcade discrète (Am → F → C → G)
  // Planifiée sur l'horloge Web Audio (lookahead), aucune ressource externe.
  // ==========================================================================

  // Note musicale routée vers le gain dédié musique (t0 = temps absolu du contexte)
  _musicNote({ type = 'square', freq, t0, dur, vol }) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Planifie les boucles à venir (appelé régulièrement, avance d'une seconde max)
  _scheduleMusicLoop() {
    if (!this.ctx || !this.musicGain) return;
    const STEP = 0.25;              // croche à 120 BPM
    const LOOP = 32 * STEP;         // boucle de 8 secondes

    // Basse (une note par temps fort) : Am, F, C, G
    const bassLine = [110, 87.31, 130.81, 98];
    // Arpèges du lead, 8 croches par accord
    const leadBars = [
      [440, 523.25, 659.25, 523.25, 440, 523.25, 659.25, 523.25],       // Am
      [349.23, 440, 523.25, 440, 349.23, 440, 523.25, 440],             // F
      [523.25, 659.25, 783.99, 659.25, 523.25, 659.25, 783.99, 659.25], // C
      [392, 493.88, 587.33, 493.88, 392, 493.88, 587.33, 493.88]        // G
    ];

    while (this.musicNextLoopTime < this.ctx.currentTime + 1.0) {
      const t0 = this.musicNextLoopTime;
      leadBars.forEach((bar, barIdx) => {
        const barStart = t0 + barIdx * 8 * STEP;
        // Basse : sur les croches 0, 2, 4, 6 de la mesure
        for (let beat = 0; beat < 8; beat += 2) {
          this._musicNote({
            type: 'triangle',
            freq: bassLine[barIdx],
            t0: barStart + beat * STEP,
            dur: STEP * 1.6,
            vol: 0.11
          });
        }
        // Lead : arpège en croches
        bar.forEach((freq, step) => {
          this._musicNote({
            type: 'square',
            freq,
            t0: barStart + step * STEP,
            dur: STEP * 0.85,
            vol: 0.05
          });
        });
      });
      this.musicNextLoopTime += LOOP;
    }
  }

  // Coupe la planification et le son (sans oublier que la page voulait de la musique)
  _haltMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx && this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
    }
  }

  // L'autoplay est bloqué tant que l'utilisateur n'a pas interagi : on retente au 1er geste
  _deferMusicOnGesture() {
    if (this._gestureHookInstalled) return;
    this._gestureHookInstalled = true;
    const resume = () => {
      document.removeEventListener('click', resume);
      document.removeEventListener('touchstart', resume);
      this._gestureHookInstalled = false;
      if (this.musicWanted && !this.muted) this.startMusic();
    };
    document.addEventListener('click', resume);
    document.addEventListener('touchstart', resume);
  }

  startMusic() {
    this.musicWanted = true;
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this._deferMusicOnGesture();
      return;
    }
    if (this.musicTimer) return; // déjà en cours

    if (!this.musicGain) {
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
    }
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.2);

    this.musicNextLoopTime = this.ctx.currentTime + 0.1;
    this._scheduleMusicLoop();
    this.musicTimer = setInterval(() => this._scheduleMusicLoop(), 400);
  }

  stopMusic() {
    this.musicWanted = false;
    this._haltMusic();
  }
}

window.soundManager = new SoundManager();
