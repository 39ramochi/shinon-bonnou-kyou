(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;   // 520
  const H = canvas.height;  // 700

  // --- UI Elements ---
  const uiScore = document.getElementById('ui-score');
  const uiHiScore = document.getElementById('ui-hiscore');
  const uiLives = document.getElementById('ui-lives');
  const uiBombs = document.getElementById('ui-bombs');
  const uiPower = document.getElementById('ui-power');
  const uiGraze = document.getElementById('ui-graze');
  const mScore = document.getElementById('m-score');
  const mLives = document.getElementById('m-lives');
  const mBombs = document.getElementById('m-bombs');
  const mPower = document.getElementById('m-power');
  const scrTitle = document.getElementById('screen-title');
  const scrPause = document.getElementById('screen-pause');
  const scrResult = document.getElementById('screen-result');
  const resTitle = document.getElementById('res-title');
  const resSub = document.getElementById('res-sub');
  const resStats = document.getElementById('res-stats');
  const chkAuto = document.getElementById('chk-auto');
  const rngBgm = document.getElementById('rng-bgm');
  const rngSe = document.getElementById('rng-se');
  const bgmAudio = document.getElementById('bgm-audio');

  // --- Web Audio API Synthesizer for SE ---
  const SoundFX = {
    ctx: null,
    vol: 0.5,
    lastShoot: 0,
    lastGraze: 0,
    init() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    },
    tone(freq1, freq2, dur, type = 'sine', gainVal = 0.2, delay = 0) {
      if (!this.ctx || this.vol <= 0.01) return;
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq1, now);
      if (freq2 !== freq1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), now + dur);
      gain.gain.setValueAtTime(gainVal * this.vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    },
    shoot() {
      const t = performance.now();
      if (t - this.lastShoot < 70) return;
      this.lastShoot = t;
      this.tone(1100, 520, 0.055, 'triangle', 0.08);
    },
    graze() {
      const t = performance.now();
      if (t - this.lastGraze < 45) return;
      this.lastGraze = t;
      this.tone(2400, 3200, 0.04, 'square', 0.07);
    },
    item() {
      this.tone(1046, 1568, 0.08, 'sine', 0.14);
    },
    kill() {
      this.tone(420, 120, 0.12, 'sawtooth', 0.14);
    },
    spell() {
      this.tone(523, 1046, 0.28, 'triangle', 0.26, 0);
      this.tone(784, 1568, 0.35, 'sine', 0.24, 0.08);
    },
    bomb() {
      this.tone(220, 55, 0.7, 'sawtooth', 0.35, 0);
      this.tone(880, 1760, 0.5, 'sine', 0.22, 0.05);
      this.tone(1318, 2637, 0.55, 'triangle', 0.2, 0.15);
    },
    pichun() {
      this.tone(880, 140, 0.45, 'sawtooth', 0.32, 0);
      this.tone(440, 90, 0.45, 'square', 0.18, 0.05);
    },
    clear() {
      [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.28, 'triangle', 0.22, i * 0.09));
    }
  };

  // --- Load Assets ---
  const assetSrc = {
    bg: 'assets/bg_shrine.jpg',
    bg2: 'assets/stage2/bg_gothic.jpg',
    player: 'assets/shirane_sd.png',
    shiraneStand: 'assets/shirane_stand.png',
    bossSkebeStand: 'assets/ayataka_skebe_stand.png',
    bossGodStand: 'assets/ayataka_god_stand.png',
    bossGodSd: 'assets/ayataka_god_sd.png',
    evilStand: 'assets/stage2/evilsweet_stand.png',
    evilSd: 'assets/stage2/evilsweet_sd.png',
    slime: 'assets/enemy_slime.png',
    ofuda: 'assets/enemy_ofuda.png',
    bat: 'assets/stage2/enemy_bat.png',
    cupcake: 'assets/stage2/enemy_cupcake.png'
  };
  const imgs = {};
  Object.entries(assetSrc).forEach(([k, src]) => {
    const img = new Image();
    img.src = src;
    imgs[k] = img;
  });

  // --- Difficulty Config ---
  const DIFFS = {
    easy:    { label: 'EASY',    bulletSpd: 0.75, density: 0.7,  bossHp: 0.8 },
    normal:  { label: 'NORMAL',  bulletSpd: 1.0,  density: 1.0,  bossHp: 1.0 },
    lunatic: { label: 'LUNATIC', bulletSpd: 1.32, density: 1.45, bossHp: 1.25 }
  };
  let currentDiff = 'normal';
  let selectedStartStage = 1;
  let currentStage = 1;

  // --- Game State ---
  let hiScore = parseInt(localStorage.getItem('shirane_stg_hiscore') || '0', 10);
  let state = 'title'; // 'title' | 'playing' | 'paused' | 'dialog' | 'gameover' | 'clear'
  let stageTime = 0;
  let bgScroll = 0;
  let score = 0;
  let grazeCount = 0;
  let power = 1.0;
  let lives = 3;
  let bombs = 3;
  let misses = 0;
  let bombsUsed = 0;
  let shake = 0;

  const player = {
    x: W / 2, y: H - 90,
    r: 3.5, grazeR: 24,
    invuln: 0, fireCd: 0,
    deathBombTimer: 0
  };

  let pBullets = [];
  let eBullets = [];
  let lasers = [];
  let enemies = [];
  let items = [];
  let particles = [];
  let popups = [];

  // Bomb, Cutin & Stage Banner state
  let activeBomb = null; // { timer, maxTimer }
  let cutin = null;      // { timer, maxTimer, name, imgKey, color, side }
  let stageBanner = null; // { timer, maxTimer, title, sub, color }

  // Boss state
  let boss = null;
  let waveIndex = 0;

  // Dialog state
  let dialogQueue = [];
  let dialogCallback = null;

  // Input
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      if (state === 'playing' || state === 'dialog') e.preventDefault();
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (state === 'playing') {
        state = 'paused';
        scrPause.classList.remove('hidden');
        bgmAudio.pause();
      } else if (state === 'paused') {
        resumeGame();
      }
    }
    if (state === 'dialog' && (e.code === 'KeyZ' || e.code === 'Enter' || e.code === 'Space')) {
      advanceDialog();
    } else if (state === 'playing' && (e.code === 'KeyX' || e.code === 'Space')) {
      tryBomb();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // Touch & Mobile Controls (relative drag so finger doesn't hide player)
  let touchActiveId = null;
  let lastTouchX = 0, lastTouchY = 0;
  let mobileSlow = false;
  let suppressClickUntil = 0;

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (state === 'dialog') {
      suppressClickUntil = performance.now() + 400;
      advanceDialog();
      return;
    }
    if (touchActiveId === null && e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      touchActiveId = t.identifier;
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (state !== 'playing' || touchActiveId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchActiveId) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = W / (rect.width || W);
        const scaleY = H / (rect.height || H);
        const sens = mobileSlow ? 0.55 : 1.05;
        const dx = (t.clientX - lastTouchX) * scaleX * sens;
        const dy = (t.clientY - lastTouchY) * scaleY * sens;
        player.x = Math.max(20, Math.min(W - 20, player.x + dx));
        player.y = Math.max(24, Math.min(H - 24, player.y + dy));
        lastTouchX = t.clientX;
        lastTouchY = t.clientY;
        break;
      }
    }
  }, { passive: false });

  const endTouch = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchActiveId) {
        touchActiveId = null;
        break;
      }
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  // PC Mouse Drag Controls (relative drag + right-click slow)
  let mouseDragging = false;
  let lastMouseX = 0, lastMouseY = 0;
  let mouseRightDown = false;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      if (state === 'dialog') return;
      mouseDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    } else if (e.button === 2) {
      mouseRightDown = true;
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (!mouseDragging || state !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / (rect.width || W);
    const scaleY = H / (rect.height || H);
    const slowNow = keys['ShiftLeft'] || keys['ShiftRight'] || mouseRightDown;
    const sens = slowNow ? 0.55 : 1.05;
    const dx = (e.clientX - lastMouseX) * scaleX * sens;
    const dy = (e.clientY - lastMouseY) * scaleY * sens;
    player.x = Math.max(20, Math.min(W - 20, player.x + dx));
    player.y = Math.max(24, Math.min(H - 24, player.y + dy));
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDragging = false;
    if (e.button === 2) mouseRightDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('click', () => {
    if (performance.now() < suppressClickUntil) return;
    if (state === 'dialog') advanceDialog();
  });

  const btnMSlow = document.getElementById('btn-m-slow');
  const btnMBomb = document.getElementById('btn-m-bomb');
  const btnMPause = document.getElementById('btn-m-pause');
  if (btnMSlow) {
    const setSlow = (v, e) => { e.preventDefault(); mobileSlow = v; btnMSlow.classList.toggle('active', v); };
    btnMSlow.addEventListener('touchstart', (e) => setSlow(true, e), { passive: false });
    btnMSlow.addEventListener('touchend', (e) => setSlow(false, e));
    btnMSlow.addEventListener('touchcancel', (e) => setSlow(false, e));
  }
  if (btnMBomb) {
    btnMBomb.addEventListener('touchstart', (e) => { e.preventDefault(); if (state === 'playing') tryBomb(); }, { passive: false });
    btnMBomb.addEventListener('click', () => { if (state === 'playing') tryBomb(); });
  }
  if (btnMPause) {
    btnMPause.addEventListener('click', () => {
      if (state === 'playing') { state = 'paused'; scrPause.classList.remove('hidden'); bgmAudio.pause(); }
      else if (state === 'paused') resumeGame();
    });
  }

  // UI Listeners
  document.querySelectorAll('.diff-btn[data-stage]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn[data-stage]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedStartStage = parseInt(btn.dataset.stage, 10) || 1;
    });
  });
  document.querySelectorAll('.diff-btn[data-diff]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn[data-diff]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDiff = btn.dataset.diff;
    });
  });
  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-retry').addEventListener('click', startGame);
  document.getElementById('btn-retry-pause').addEventListener('click', () => {
    scrPause.classList.add('hidden');
    startGame();
  });
  document.getElementById('btn-title-pause').addEventListener('click', returnToTitle);
  document.getElementById('btn-title-result').addEventListener('click', returnToTitle);
  document.getElementById('btn-resume').addEventListener('click', resumeGame);

  // Update Info Modal
  const UPDATE_KEY = 'shirane_stg_seen_update_v1_2';
  const modalUpdate = document.getElementById('modal-update');
  const btnOpenUpdate = document.getElementById('btn-open-update');
  const btnCloseUpdate = document.getElementById('btn-close-update');
  const chkHideUpdate = document.getElementById('chk-hide-update');
  if (modalUpdate) {
    if (!localStorage.getItem(UPDATE_KEY)) {
      modalUpdate.classList.remove('hidden');
    }
    if (btnCloseUpdate) {
      btnCloseUpdate.addEventListener('click', () => {
        if (chkHideUpdate && chkHideUpdate.checked) {
          localStorage.setItem(UPDATE_KEY, '1');
        } else {
          localStorage.removeItem(UPDATE_KEY);
        }
        modalUpdate.classList.add('hidden');
      });
    }
    if (btnOpenUpdate) {
      btnOpenUpdate.addEventListener('click', () => {
        modalUpdate.classList.remove('hidden');
      });
    }
  }

  rngBgm.addEventListener('input', () => {
    bgmAudio.volume = parseFloat(rngBgm.value);
  });
  rngSe.addEventListener('input', () => {
    SoundFX.vol = parseFloat(rngSe.value);
  });

  function returnToTitle() {
    state = 'title';
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
    pBullets = [];
    eBullets = [];
    lasers = [];
    enemies = [];
    items = [];
    particles = [];
    boss = null;
    activeBomb = null;
    cutin = null;
    stageBanner = null;
    dialogQueue = [];
    scrPause.classList.add('hidden');
    scrResult.classList.add('hidden');
    scrTitle.classList.remove('hidden');
  }

  function resumeGame() {
    state = 'playing';
    scrPause.classList.add('hidden');
    bgmAudio.play().catch(() => {});
  }

  function updateHUD() {
    if (score > hiScore) {
      hiScore = score;
      localStorage.setItem('shirane_stg_hiscore', String(hiScore));
    }
    uiScore.textContent = String(score).padStart(7, '0');
    uiHiScore.textContent = String(hiScore).padStart(7, '0');
    uiLives.textContent = '♥'.repeat(Math.max(0, lives)) || '—';
    uiBombs.textContent = '★'.repeat(Math.max(0, bombs)) || '—';
    uiPower.textContent = `${power.toFixed(2)} / 4.00`;
    uiGraze.textContent = String(grazeCount);
    if (mScore) mScore.textContent = uiScore.textContent;
    if (mLives) mLives.textContent = uiLives.textContent;
    if (mBombs) mBombs.textContent = uiBombs.textContent;
    if (mPower) mPower.textContent = power.toFixed(2);
  }

  function startGame() {
    SoundFX.init();
    SoundFX.vol = parseFloat(rngSe.value);
    bgmAudio.volume = parseFloat(rngBgm.value) * 0.72;
    bgmAudio.currentTime = 0;
    bgmAudio.play().catch(() => {});

    scrTitle.classList.add('hidden');
    scrPause.classList.add('hidden');
    scrResult.classList.add('hidden');

    beginStage(selectedStartStage, false);
  }

  function beginStage(stageNum, keepStats) {
    currentStage = stageNum;
    state = 'playing';
    stageTime = 0;
    bgScroll = 0;
    shake = 0;
    waveIndex = 0;

    if (!keepStats) {
      score = 0;
      grazeCount = 0;
      power = stageNum === 2 ? 2.2 : 1.0;
      lives = 3;
      bombs = 3;
      misses = 0;
      bombsUsed = 0;
    }

    player.x = W / 2;
    player.y = H - 90;
    player.invuln = 1.8;
    player.fireCd = 0;
    player.deathBombTimer = 0;

    pBullets = [];
    eBullets = [];
    lasers = [];
    enemies = [];
    items = [];
    particles = [];
    popups = [];
    boss = null;
    activeBomb = null;
    cutin = null;

    stageBanner = stageNum === 1
      ? { timer: 3.2, maxTimer: 3.2, title: 'STAGE 1 : ハイパーSUNO神社参道', sub: '〜 煩悩まみれの神主をお祓いせよ！ 〜', color: '#00f5d4' }
      : { timer: 3.4, maxTimer: 3.4, title: 'STAGE 2 : 闇菓子のゴシック回廊', sub: '〜 真犯人 Evil Sweet を追え！ 〜', color: '#e879f9' };

    updateHUD();
  }

  // --- Helper Spawners ---
  function addParticles(x, y, color, count = 10, spd = 160, size = 4) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.3 + Math.random() * 0.8) * spd;
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.3, maxLife: 0.65, color, size
      });
    }
  }

  function spawnItems(x, y, pCount, sCount) {
    for (let i = 0; i < pCount; i++) {
      items.push({ x: x + (Math.random() - 0.5) * 28, y: y + (Math.random() - 0.5) * 20, vy: -85, kind: 'power', magnet: false });
    }
    for (let i = 0; i < sCount; i++) {
      items.push({ x: x + (Math.random() - 0.5) * 28, y: y + (Math.random() - 0.5) * 20, vy: -95, kind: 'score', magnet: false });
    }
  }

  function bulletsToItems() {
    eBullets.forEach((b, idx) => {
      if (idx % 2 === 0) items.push({ x: b.x, y: b.y, vy: -40, kind: 'star', magnet: true });
      addParticles(b.x, b.y, '#e0f2fe', 1, 60, 3);
    });
    eBullets = [];
    lasers = [];
  }

  function addBullet(x, y, vx, vy, r = 5, color = '#f472b6', shape = 'orb', extra = {}) {
    eBullets.push({ x, y, vx, vy, r, color, shape, grazed: false, age: 0, ...extra });
  }

  function addLaser(x1, y1, x2, y2, width = 16, warnTimer = 0.95, activeTimer = 0.6, color = '#e879f9') {
    lasers.push({ x1, y1, x2, y2, width, warnTimer, activeTimer, maxActive: activeTimer, color, grazed: false });
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function aimAngle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  }

  // --- Player Shot & Bomb ---
  function firePlayerShot() {
    SoundFX.shoot();
    const dmgBase = 12;
    // Main Suzu / Note shots
    const offsets = power >= 3.0 ? [-18, -6, 6, 18] : (power >= 2.0 ? [-14, 0, 14] : [-8, 8]);
    offsets.forEach((ox, i) => {
      const ang = -Math.PI / 2 + (power >= 2.0 ? ox * 0.004 : 0);
      pBullets.push({
        x: player.x + ox, y: player.y - 16,
        vx: Math.cos(ang) * 760, vy: Math.sin(ang) * 760,
        dmg: dmgBase, color: '#38bdf8', kind: 'note', r: 6
      });
    });
    // Homing Ofuda side shots when power >= 1.5
    if (power >= 1.5) {
      [-26, 26].forEach(ox => {
        pBullets.push({
          x: player.x + ox, y: player.y - 6,
          vx: ox * 2.2, vy: -580,
          dmg: 8 + power * 1.5, color: '#fb7185', kind: 'homing', r: 6
        });
      });
    }
  }

  function tryBomb() {
    if (bombs <= 0 || activeBomb) return;
    bombs--;
    bombsUsed++;
    player.deathBombTimer = 0;
    player.invuln = 3.2;
    activeBomb = { timer: 2.4, maxTimer: 2.4 };
    cutin = { timer: 1.8, maxTimer: 1.8, name: '浄化神楽『ハイパーお清めボンバー』', imgKey: 'shiraneStand', color: '#38bdf8', side: 'left' };
    shake = 14;
    SoundFX.bomb();
    bulletsToItems();
    // Damage all enemies on screen
    enemies.forEach(e => { e.hp -= 280; });
    if (boss && !boss.invuln) boss.hp -= 320;
    updateHUD();
  }

  // --- Stage Enemy Waves ---
  function updateStageWaves(t) {
    if (currentStage === 1) updateStage1Waves(t);
    else updateStage2Waves(t);
  }

  function updateStage1Waves(t) {
    const d = DIFFS[currentDiff];
    if (waveIndex === 0 && t > 1.2) {
      waveIndex++;
      for (let i = 0; i < 6; i++) {
        enemies.push({ x: 70 + i * 76, y: -30 - i * 18, vx: 0, vy: 85, hp: 50, maxHp: 50, kind: 'slime', r: 22, fireCd: 0.9 + i * 0.15, age: 0 });
      }
    }
    if (waveIndex === 1 && t > 6.0) {
      waveIndex++;
      for (let i = 0; i < 5; i++) {
        enemies.push({ x: 80 + i * 90, y: -30, vx: Math.sin(i) * 25, vy: 70, hp: 75, maxHp: 75, kind: 'ofuda', r: 24, fireCd: 1.0, age: 0 });
      }
    }
    if (waveIndex === 2 && t > 12.0) {
      waveIndex++;
      // Mid-wave twin elites
      enemies.push({ x: 140, y: -40, vx: 0, vy: 55, hp: 260, maxHp: 260, kind: 'ofuda', r: 34, elite: true, fireCd: 0.8, age: 0, stopY: 150 });
      enemies.push({ x: W - 140, y: -40, vx: 0, vy: 55, hp: 260, maxHp: 260, kind: 'ofuda', r: 34, elite: true, fireCd: 0.8, age: 0, stopY: 150 });
    }
    if (waveIndex === 3 && t > 19.5) {
      waveIndex++;
      for (let i = 0; i < 8; i++) {
        const fromLeft = i % 2 === 0;
        enemies.push({
          x: fromLeft ? -25 : W + 25, y: 70 + i * 24,
          vx: fromLeft ? 130 : -130, vy: 22, hp: 55, maxHp: 55,
          kind: 'slime', r: 22, fireCd: 0.6 + (i * 0.12) / d.density, age: 0
        });
      }
    }
    if (waveIndex === 4 && t > 26.5) {
      waveIndex++;
      bulletsToItems();
      startBossIntro();
    }
  }

  function updateStage2Waves(t) {
    const d = DIFFS[currentDiff];
    if (waveIndex === 0 && t > 1.2) {
      waveIndex++;
      // Sugar Bats swooping from both sides
      for (let i = 0; i < 8; i++) {
        const fromLeft = i % 2 === 0;
        enemies.push({
          x: fromLeft ? -25 : W + 25, y: 50 + Math.floor(i / 2) * 34,
          vx: fromLeft ? 145 : -145, vy: 36, hp: 65, maxHp: 65,
          kind: 'bat', r: 24, fireCd: 0.55 + (i * 0.08) / d.density, age: 0
        });
      }
    }
    if (waveIndex === 1 && t > 6.2) {
      waveIndex++;
      // Curse Cupcakes descending in formation
      for (let i = 0; i < 5; i++) {
        enemies.push({
          x: 75 + i * 92, y: -30 - Math.abs(2 - i) * 20,
          vx: 0, vy: 75, hp: 105, maxHp: 105,
          kind: 'cupcake', r: 26, fireCd: 0.8 + i * 0.12, age: 0
        });
      }
    }
    if (waveIndex === 2 && t > 12.2) {
      waveIndex++;
      // Twin Elite Cupcakes
      enemies.push({ x: 125, y: -40, vx: 0, vy: 62, hp: 360, maxHp: 360, kind: 'cupcake', r: 36, elite: true, fireCd: 0.7, age: 0, stopY: 145 });
      enemies.push({ x: W - 125, y: -40, vx: 0, vy: 62, hp: 360, maxHp: 360, kind: 'cupcake', r: 36, elite: true, fireCd: 0.7, age: 0, stopY: 145 });
    }
    if (waveIndex === 3 && t > 20.0) {
      waveIndex++;
      // Rapid Bat Rush
      for (let i = 0; i < 10; i++) {
        enemies.push({
          x: 45 + (i % 5) * 105, y: -35 - Math.floor(i / 5) * 65,
          vx: Math.sin(i) * 45, vy: 115, hp: 70, maxHp: 70,
          kind: 'bat', r: 24, fireCd: 0.55 / d.density, age: 0
        });
      }
    }
    if (waveIndex === 4 && t > 25.5) {
      waveIndex++;
      // Center Elite Bat + side Cupcakes
      enemies.push({ x: W / 2, y: -45, vx: 0, vy: 58, hp: 420, maxHp: 420, kind: 'bat', r: 38, elite: true, fireCd: 0.5, age: 0, stopY: 130 });
      enemies.push({ x: 90, y: -30, vx: 18, vy: 65, hp: 130, maxHp: 130, kind: 'cupcake', r: 26, fireCd: 0.9, age: 0 });
      enemies.push({ x: W - 90, y: -30, vx: -18, vy: 65, hp: 130, maxHp: 130, kind: 'cupcake', r: 26, fireCd: 0.9, age: 0 });
    }
    if (waveIndex === 5 && t > 32.5) {
      waveIndex++;
      bulletsToItems();
      startBossIntro();
    }
  }

  // --- Dialog System ---
  function startDialog(lines, onComplete) {
    state = 'dialog';
    dialogQueue = lines.slice();
    dialogCallback = onComplete;
  }

  function advanceDialog() {
    SoundFX.item();
    dialogQueue.shift();
    if (dialogQueue.length === 0) {
      state = 'playing';
      if (dialogCallback) dialogCallback();
    }
  }

  function startBossIntro() {
    if (currentStage === 1) {
      boss = {
        id: 'ayataka',
        name: 'ayataka',
        x: W / 2, y: -90, targetX: W / 2, targetY: 135,
        phase: 0, // 0: Normal1, 1: Spell1, 2: Normal2, 3: Spell2, 4: LastSpell
        maxPhases: 5,
        hp: 900 * DIFFS[currentDiff].bossHp,
        maxHp: 900 * DIFFS[currentDiff].bossHp,
        timer: 35,
        invuln: true,
        fireCd: 0.5,
        angle: 0,
        spellName: '',
        purified: false
      };

      startDialog([
        { speaker: 'shirane', name: '白音（首席巫女）', text: '神主様！また煩悩（スケベ心）に飲まれて、お社がピンクのノイズだらけですっ！' },
        { speaker: 'ayataka_skebe', name: 'スケベ大魔神 ayataka', text: 'ふははは！煩悩こそ創作の源！このBPM180の快楽ビートに逆らえるものか！' },
        { speaker: 'shirane', name: '白音（首席巫女）', text: '立派なayataka神になってもらうため、その煩悩……神楽鈴でぜんぶお祓いしますっ！' },
        { speaker: 'ayataka_skebe', name: 'スケベ大魔神 ayataka', text: '面白い！ならば我が音欲の弾幕、耐えてみせよ！！' }
      ], () => {
        boss.invuln = false;
        bgmAudio.volume = parseFloat(rngBgm.value);
        SoundFX.spell();
      });
    } else {
      boss = {
        id: 'evilsweet',
        name: 'Evil Sweet',
        x: W / 2, y: -90, targetX: W / 2, targetY: 130,
        phase: 0,
        maxPhases: 5,
        hp: 1150 * DIFFS[currentDiff].bossHp,
        maxHp: 1150 * DIFFS[currentDiff].bossHp,
        timer: 38,
        invuln: true,
        fireCd: 0.6,
        subCd: 1.5,
        angle: 0,
        spellName: '',
        purified: false
      };

      startDialog([
        { speaker: 'shirane', name: '白音（首席巫女）', text: '見つけましたよ！神主様に甘いお酒とお菓子を差し入れて、煩悩ビートを仕込んだ真犯人！' },
        { speaker: 'evilsweet', name: 'Evil Sweet（闇甘味の魔女）', text: 'あら、お社の巫女さん？せっかく甘いお菓子と重低音で夢見心地にしてあげたのに、お邪魔虫ね♪' },
        { speaker: 'shirane', name: '白音（首席巫女）', text: '神社の平和を乱す悪い甘味は、ここでまとめて浄化しちゃいますっ！' },
        { speaker: 'evilsweet', name: 'Evil Sweet（闇甘味の魔女）', text: 'ふふっ、できるかしら？ 私の甘い罠と闇の弾幕、たっぷり味わっていきなさいなっ！' }
      ], () => {
        boss.invuln = false;
        bgmAudio.volume = parseFloat(rngBgm.value);
        SoundFX.spell();
      });
    }
  }

  function triggerBossNextPhase() {
    bulletsToItems();
    boss.phase++;
    if (boss.phase >= boss.maxPhases) {
      boss.purified = true;
      boss.invuln = true;
      shake = 18;
      SoundFX.clear();
      addParticles(boss.x, boss.y, boss.id === 'ayataka' ? '#00f5d4' : '#e879f9', 45, 280, 7);
      addParticles(boss.x, boss.y, '#fde047', 35, 240, 6);

      if (boss.id === 'ayataka') {
        startDialog([
          { speaker: 'ayataka_god', name: 'ayataka神（覚醒）', text: '……むっ！？ 頭の中のピンク色のモヤが晴れていく……！' },
          { speaker: 'shirane', name: '白音（首席巫女）', text: 'やったぁ！煩悩が浄化されました！お目覚めですか、ayataka神様！' },
          { speaker: 'ayataka_god', name: 'ayataka神（覚醒）', text: 'うむ、見事だったぞ白音。だが……私に甘いお酒と魔菓子を差し入れて煩悩へ誘惑した黒幕が、神社裏の洋館に潜んでおる！' },
          { speaker: 'shirane', name: '白音（首席巫女）', text: 'なっ、真犯人がいたんですね！？ そのまま引き継いで追撃しますっ！' }
        ], () => {
          beginStage(2, true);
        });
      } else {
        startDialog([
          { speaker: 'evilsweet', name: 'Evil Sweet（闇甘味の魔女）', text: 'きゃあっ！？ お菓子の魔法が……全部シュガーパウダーにされちゃう〜！！' },
          { speaker: 'shirane', name: '白音（首席巫女）', text: 'これにてお祓い完了ですっ！神社に甘い罠を仕掛けるのはもうおしまい！' },
          { speaker: 'evilsweet', name: 'Evil Sweet（闇甘味の魔女）', text: 'くぅっ、覚えてなさいよっ！次はもっと激甘でビターな弾幕を用意してリベンジするんだからっ！' },
          { speaker: 'shirane', name: '白音（首席巫女）', text: 'いつでも受けて立ちます♪ ハイパーSUNO神社、完全平和ですっ！' }
        ], () => {
          finishGame(true);
        });
      }
      return;
    }

    const d = DIFFS[currentDiff];
    if (boss.id === 'ayataka') {
      const hpTable = [900, 1250, 1000, 1350, 1700];
      const spellNames = [
        '',
        '音欲『煩悩ハート・フェスティバル』',
        '',
        '甘酒『酔いどれ神主の千鳥足ウェーブ』',
        '覚醒『ハイパーSUNO神・煩悩浄化ドロップ』'
      ];
      boss.hp = hpTable[boss.phase] * d.bossHp;
      boss.maxHp = boss.hp;
      boss.timer = 40;
      boss.fireCd = 0.7;
      boss.spellName = spellNames[boss.phase];
      if (boss.spellName) {
        SoundFX.spell();
        cutin = { timer: 1.5, maxTimer: 1.5, name: boss.spellName, imgKey: 'bossSkebeStand', color: '#f472b6', side: 'right' };
      }
    } else {
      const hpTable = [1150, 1550, 1300, 1650, 2100];
      const spellNames = [
        '',
        '甘罠『スイート・ポイズン・ケージ』',
        '',
        '夜菓『ヴァンパイア・ティーパーティ』',
        '紅魔甘『ブラッディ・マカロン・フィナーレ』'
      ];
      boss.hp = hpTable[boss.phase] * d.bossHp;
      boss.maxHp = boss.hp;
      boss.timer = 44;
      boss.fireCd = 0.7;
      boss.subCd = 1.2;
      boss.spellName = spellNames[boss.phase];
      if (boss.spellName) {
        SoundFX.spell();
        cutin = { timer: 1.5, maxTimer: 1.5, name: boss.spellName, imgKey: 'evilStand', color: '#e879f9', side: 'right' };
      }
    }
  }

  function updateBoss(dt) {
    if (!boss) return;
    boss.x += (boss.targetX - boss.x) * Math.min(1, dt * 4);
    boss.y += (boss.targetY - boss.y) * Math.min(1, dt * 4);
    if (boss.invuln) return;

    boss.timer -= dt;
    if (boss.hp <= 0 || boss.timer <= 0) {
      score += boss.id === 'evilsweet' ? 25000 : 15000;
      triggerBossNextPhase();
      return;
    }

    if (boss.id === 'ayataka') updateAyatakaBoss(dt);
    else updateEvilSweetBoss(dt);
  }

  function updateAyatakaBoss(dt) {
    const d = DIFFS[currentDiff];
    boss.angle += dt * 1.9;
    boss.fireCd -= dt;

    if (boss.phase === 3) {
      boss.targetX = W / 2 + Math.sin(stageTime * 2.1) * 145;
      boss.targetY = 125 + Math.cos(stageTime * 3.4) * 28;
    } else if (boss.phase === 1 || boss.phase === 4) {
      boss.targetX = W / 2 + Math.sin(stageTime * 0.9) * 70;
      boss.targetY = 135;
    } else {
      boss.targetX = W / 2 + Math.sin(stageTime * 1.3) * 110;
    }

    if (boss.fireCd <= 0) {
      const spd = 190 * d.bulletSpd;
      if (boss.phase === 0) {
        boss.fireCd = 0.55 / d.density;
        const n = Math.round(14 * d.density);
        for (let i = 0; i < n; i++) {
          const a = boss.angle + (i * Math.PI * 2) / n;
          addBullet(boss.x, boss.y, Math.cos(a) * spd, Math.sin(a) * spd, 5, '#c084fc', 'orb');
        }
        const pa = aimAngle(boss.x, boss.y, player.x, player.y);
        for (let k = -1; k <= 1; k++) {
          const a = pa + k * 0.16;
          addBullet(boss.x, boss.y, Math.cos(a) * (spd * 1.25), Math.sin(a) * (spd * 1.25), 6, '#38bdf8', 'note');
        }
      } else if (boss.phase === 1) {
        boss.fireCd = 0.22 / d.density;
        const arms = 5;
        for (let i = 0; i < arms; i++) {
          const a1 = boss.angle * 1.8 + (i * Math.PI * 2) / arms;
          const a2 = -boss.angle * 1.5 + (i * Math.PI * 2) / arms;
          addBullet(boss.x, boss.y, Math.cos(a1) * spd * 1.05, Math.sin(a1) * spd * 1.05, 6.5, '#f472b6', 'heart');
          addBullet(boss.x, boss.y, Math.cos(a2) * spd * 0.85, Math.sin(a2) * spd * 0.85, 5.5, '#c084fc', 'orb');
        }
      } else if (boss.phase === 2) {
        boss.fireCd = 0.42 / d.density;
        const pa = aimAngle(boss.x, boss.y, player.x, player.y);
        const ways = currentDiff === 'lunatic' ? 9 : 5;
        for (let i = -(ways >> 1); i <= (ways >> 1); i++) {
          const a = pa + i * 0.14;
          addBullet(boss.x, boss.y, Math.cos(a) * spd * 1.2, Math.sin(a) * spd * 1.2, 5.5, '#fb7185', 'orb');
        }
      } else if (boss.phase === 3) {
        boss.fireCd = 0.16 / d.density;
        for (let k = -2; k <= 2; k++) {
          const a = Math.PI / 2 + k * 0.28 + Math.sin(stageTime * 4) * 0.25;
          addBullet(boss.x, boss.y, Math.cos(a) * spd * 1.15, Math.sin(a) * spd * 1.15, 6, k === 0 ? '#fde047' : '#a855f7', 'orb');
        }
      } else if (boss.phase === 4) {
        boss.fireCd = 0.18 / d.density;
        const n = Math.round(12 * d.density);
        for (let i = 0; i < n; i++) {
          const a = boss.angle * 2.2 + (i * Math.PI * 2) / n;
          addBullet(boss.x, boss.y, Math.cos(a) * spd * 1.1, Math.sin(a) * spd * 1.1, 5.5, i % 2 === 0 ? '#00f5d4' : '#f472b6', 'note');
        }
        if (Math.random() < 0.35) {
          const pa = aimAngle(boss.x, boss.y, player.x, player.y);
          addBullet(boss.x, boss.y, Math.cos(pa) * spd * 1.45, Math.sin(pa) * spd * 1.45, 7.5, '#fde047', 'star');
        }
      }
    }
  }

  function updateEvilSweetBoss(dt) {
    const d = DIFFS[currentDiff];
    boss.angle += dt * 2.3;
    boss.fireCd -= dt;
    boss.subCd -= dt;

    if (boss.phase === 1) {
      boss.targetX = W / 2 + Math.sin(stageTime * 1.1) * 120;
      boss.targetY = 125;
    } else if (boss.phase === 3) {
      boss.targetX = W / 2 + Math.sin(stageTime * 1.8) * 155;
      boss.targetY = 115 + Math.cos(stageTime * 2.7) * 24;
    } else if (boss.phase === 4) {
      boss.targetX = W / 2 + Math.sin(stageTime * 0.9) * 85;
      boss.targetY = 135;
    } else {
      boss.targetX = W / 2 + Math.sin(stageTime * 1.5) * 130;
      boss.targetY = 130;
    }

    const spd = 215 * d.bulletSpd;

    if (boss.phase === 0 && boss.fireCd <= 0) {
      // Normal 1: Cross Diamond Kunai fans + Bat aimed burst
      boss.fireCd = 0.45 / d.density;
      const n = Math.round(10 * d.density);
      for (let i = 0; i < n; i++) {
        const a1 = boss.angle + (i * Math.PI * 2) / n;
        const a2 = -boss.angle * 0.8 + (i * Math.PI * 2) / n;
        addBullet(boss.x, boss.y, Math.cos(a1) * spd * 1.05, Math.sin(a1) * spd * 1.05, 6, '#e879f9', 'diamond');
        addBullet(boss.x, boss.y, Math.cos(a2) * spd * 0.85, Math.sin(a2) * spd * 0.85, 6, '#38bdf8', 'diamond');
      }
      if (Math.random() < 0.65) {
        const pa = aimAngle(boss.x, boss.y, player.x, player.y);
        for (let k = -1; k <= 1; k++) {
          const a = pa + k * 0.2;
          addBullet(boss.x, boss.y, Math.cos(a) * spd * 1.2, Math.sin(a) * spd * 1.2, 7.5, '#a855f7', 'bat');
        }
      }
    } else if (boss.phase === 1) {
      // Spell 1: Sweet Poison Cage (Warning Lasers + Delayed-Turn Diamond Kunai)
      if (boss.subCd <= 0) {
        boss.subCd = 2.6 / Math.max(0.85, d.density * 0.9);
        const lx = 60 + Math.random() * (W - 120);
        addLaser(lx, 0, lx + (Math.random() - 0.5) * 110, H, 18, 0.9, 0.55, '#e879f9');
        const ly = 240 + Math.random() * (H - 310);
        addLaser(0, ly, W, ly + (Math.random() - 0.5) * 90, 16, 0.95, 0.5, '#f43f5e');
      }
      if (boss.fireCd <= 0) {
        boss.fireCd = 0.58 / d.density;
        const n = Math.round(12 * d.density);
        for (let i = 0; i < n; i++) {
          const a = boss.angle + (i * Math.PI * 2) / n;
          addBullet(boss.x, boss.y, Math.cos(a) * spd * 0.85, Math.sin(a) * spd * 0.85, 6, '#f472b6', 'diamond', {
            turnAt: 0.75, turned: false, turnSpd: spd * 1.25
          });
        }
      }
    } else if (boss.phase === 2 && boss.fireCd <= 0) {
      // Normal 2: Rapid Bat Waves + Giant Candy Ring
      boss.fireCd = 0.36 / d.density;
      const pa = aimAngle(boss.x, boss.y, player.x, player.y);
      const ways = currentDiff === 'lunatic' ? 7 : 5;
      for (let i = -(ways >> 1); i <= (ways >> 1); i++) {
        const a = pa + i * 0.16;
        addBullet(boss.x, boss.y, Math.cos(a) * spd * 1.15, Math.sin(a) * spd * 1.15, 7.5, '#c084fc', 'bat');
      }
      if (Math.random() < 0.38) {
        const cn = Math.round(8 * d.density);
        for (let i = 0; i < cn; i++) {
          const a = -boss.angle + (i * Math.PI * 2) / cn;
          addBullet(boss.x, boss.y, Math.cos(a) * spd * 0.72, Math.sin(a) * spd * 0.72, 11, '#fb7185', 'candy');
        }
      }
    } else if (boss.phase === 3) {
      // Spell 2: Vampire Tea Party (Bouncing Candy Orbs + Diagonal Diamond Shower)
      if (boss.fireCd <= 0) {
        boss.fireCd = 0.24 / d.density;
        for (let side = -1; side <= 1; side += 2) {
          const sx = boss.x + side * 40;
          const a = Math.PI / 2 + side * (0.4 + Math.sin(stageTime * 3.5) * 0.35);
          addBullet(sx, boss.y, Math.cos(a) * spd * 1.1, Math.sin(a) * spd * 1.1, 6, side < 0 ? '#38bdf8' : '#e879f9', 'diamond');
        }
      }
      if (boss.subCd <= 0) {
        boss.subCd = 1.35 / d.density;
        const cn = Math.round(7 * d.density);
        for (let i = 0; i < cn; i++) {
          const a = boss.angle + (i * Math.PI * 2) / cn;
          addBullet(boss.x, boss.y, Math.cos(a) * spd * 0.85, Math.sin(a) * spd * 0.85, 11.5, i % 2 === 0 ? '#f43f5e' : '#a855f7', 'candy', {
            bounces: 1
          });
        }
      }
    } else if (boss.phase === 4) {
      // Last Spell: Bloody Macaron Finale (Double Spiral Diamonds + Aimed Lasers + Bats)
      if (boss.fireCd <= 0) {
        boss.fireCd = 0.16 / d.density;
        const arms = currentDiff === 'lunatic' ? 6 : 4;
        for (let i = 0; i < arms; i++) {
          const a1 = boss.angle * 2.1 + (i * Math.PI * 2) / arms;
          const a2 = -boss.angle * 1.7 + (i * Math.PI * 2) / arms;
          addBullet(boss.x, boss.y, Math.cos(a1) * spd * 1.08, Math.sin(a1) * spd * 1.08, 6, '#f43f5e', 'diamond');
          addBullet(boss.x, boss.y, Math.cos(a2) * spd * 0.92, Math.sin(a2) * spd * 0.92, 7.5, '#a855f7', 'bat');
        }
      }
      if (boss.subCd <= 0) {
        boss.subCd = 2.2 / Math.max(0.85, d.density * 0.9);
        const pa = aimAngle(boss.x, boss.y, player.x, player.y);
        const tx = boss.x + Math.cos(pa) * 900;
        const ty = boss.y + Math.sin(pa) * 900;
        addLaser(boss.x, boss.y, tx, ty, 20, 0.85, 0.55, '#f43f5e');
        for (let k = -2; k <= 2; k++) {
          const a = pa + k * 0.24;
          addBullet(boss.x, boss.y, Math.cos(a) * spd * 0.78, Math.sin(a) * spd * 0.78, 11, '#f472b6', 'candy');
        }
      }
    }
  }

  function finishGame(isClear) {
    state = isClear ? 'clear' : 'gameover';
    bgmAudio.pause();
    const clearBonus = isClear ? (lives * 25000 + bombs * 10000 + 50000) : 0;
    score += clearBonus;
    updateHUD();

    resTitle.textContent = isClear ? 'お祓い完了！ALL STAGE CLEAR!' : '満身創痍… GAME OVER';
    resSub.textContent = isClear
      ? '黒幕 Evil Sweet も退散し、ハイパーSUNO神社に真の平和が訪れました！'
      : (currentStage === 2
        ? 'Evil Sweet の甘い罠と闇の弾幕に圧倒されてしまった…再挑戦しよう！'
        : 'スケベ大魔神の煩悩弾幕に圧倒されてしまった…再挑戦しよう！');

    resStats.innerHTML = `
      <div><span>最終スコア</span><b style="color:#00f5d4">${score.toLocaleString()}</b></div>
      <div><span>グレイズ（かすり）</span><b>${grazeCount} 回</b></div>
      <div><span>被弾回数</span><b>${misses} 回</b></div>
      <div><span>ボム使用回数</span><b>${bombsUsed} 回</b></div>
      <div><span>クリアボーナス</span><b style="color:#fde047">+${clearBonus.toLocaleString()}</b></div>
    `;
    scrResult.classList.remove('hidden');
  }

  // --- Main Update ---
  function update(dt) {
    bgScroll = (bgScroll + (currentStage === 2 ? 120 : 95) * dt) % H;
    if (shake > 0) shake = Math.max(0, shake - 35 * dt);
    if (cutin) {
      cutin.timer -= dt;
      if (cutin.timer <= 0) cutin = null;
    }
    if (stageBanner) {
      stageBanner.timer -= dt;
      if (stageBanner.timer <= 0) stageBanner = null;
    }

    if (state !== 'playing') return;
    stageTime += dt;
    updateStageWaves(stageTime);

    // Player movement
    const slow = keys['ShiftLeft'] || keys['ShiftRight'] || mobileSlow || mouseRightDown;
    const spd = slow ? 135 : 295;
    let dx = 0, dy = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) dx -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
    if (keys['ArrowUp'] || keys['KeyW']) dy -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) dy += 1;
    if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
    player.x = Math.max(20, Math.min(W - 20, player.x + dx * spd * dt));
    player.y = Math.max(24, Math.min(H - 24, player.y + dy * spd * dt));

    if (player.invuln > 0) player.invuln -= dt;
    if (player.deathBombTimer > 0) {
      player.deathBombTimer -= dt;
      if (player.deathBombTimer <= 0) {
        // Confirm miss
        lives--;
        misses++;
        SoundFX.pichun();
        shake = 16;
        addParticles(player.x, player.y, '#fb7185', 28, 220, 5);
        eBullets = [];
        player.invuln = 2.5;
        player.x = W / 2;
        player.y = H - 85;
        updateHUD();
        if (lives <= 0) {
          finishGame(false);
          return;
        }
      }
    }

    // Player fire
    player.fireCd -= dt;
    if ((chkAuto.checked || keys['KeyZ']) && player.fireCd <= 0) {
      player.fireCd = 0.085;
      firePlayerShot();
    }

    // Active Bomb
    if (activeBomb) {
      activeBomb.timer -= dt;
      if (Math.random() < 0.6) addParticles(Math.random() * W, Math.random() * H, '#38bdf8', 3, 180, 5);
      if (activeBomb.timer <= 0) activeBomb = null;
    }

    // Update Player Bullets
    for (let i = pBullets.length - 1; i >= 0; i--) {
      const b = pBullets[i];
      if (b.kind === 'homing') {
        const target = (boss && !boss.invuln) ? boss : enemies[0];
        if (target) {
          const a = aimAngle(b.x, b.y, target.x, target.y);
          b.vx += Math.cos(a) * 1800 * dt;
          b.vy += Math.sin(a) * 1800 * dt;
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 680) { b.vx = (b.vx / sp) * 680; b.vy = (b.vy / sp) * 680; }
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      let hit = false;
      if (boss && !boss.invuln) {
        if (Math.hypot(boss.x - b.x, boss.y - b.y) < 48) {
          boss.hp -= b.dmg;
          score += 20;
          hit = true;
          addParticles(b.x, b.y, b.color, 2, 90, 3);
        }
      }
      if (!hit) {
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
            e.hp -= b.dmg;
            score += 25;
            hit = true;
            addParticles(b.x, b.y, b.color, 2, 90, 3);
            if (e.hp <= 0) {
              SoundFX.kill();
              score += e.elite ? 2500 : 400;
              addParticles(e.x, e.y, '#c084fc', 14, 180, 4);
              spawnItems(e.x, e.y, e.elite ? 5 : 1, e.elite ? 6 : 2);
              enemies.splice(j, 1);
            }
            break;
          }
        }
      }
      if (hit || b.y < -30 || b.x < -30 || b.x > W + 30) pBullets.splice(i, 1);
    }

    // Update Enemies
    const d = DIFFS[currentDiff];
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.age += dt;
      if (e.stopY && e.y >= e.stopY) {
        e.vy = 0;
        if (e.age > 6.5) e.vy = -80;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.fireCd -= dt;
      if (e.fireCd <= 0 && e.y > 20 && e.y < H * 0.65) {
        e.fireCd = (e.elite ? 0.65 : 1.35) / d.density;
        const pa = aimAngle(e.x, e.y, player.x, player.y);
        if (e.kind === 'bat') {
          const ways = e.elite ? 7 : 3;
          for (let k = -(ways >> 1); k <= (ways >> 1); k++) {
            const a = pa + k * 0.2;
            const sp = (e.elite ? 210 : 185) * d.bulletSpd;
            addBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 6, '#e879f9', 'diamond');
          }
        } else if (e.kind === 'cupcake') {
          if (e.elite) {
            const n = Math.round(10 * d.density);
            for (let k = 0; k < n; k++) {
              const a = e.age * 1.4 + (k * Math.PI * 2) / n;
              addBullet(e.x, e.y, Math.cos(a) * 165 * d.bulletSpd, Math.sin(a) * 165 * d.bulletSpd, 10, '#fb7185', 'candy');
            }
          } else {
            for (let k = -1; k <= 1; k++) {
              const a = pa + k * 0.28;
              addBullet(e.x, e.y, Math.cos(a) * 160 * d.bulletSpd, Math.sin(a) * 160 * d.bulletSpd, 9, '#f472b6', 'candy');
            }
          }
        } else {
          const ways = e.elite ? 5 : (e.kind === 'ofuda' ? 3 : 1);
          for (let k = -(ways >> 1); k <= (ways >> 1); k++) {
            const a = pa + k * 0.22;
            const sp = (e.elite ? 195 : 165) * d.bulletSpd;
            addBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 5.5, e.kind === 'ofuda' ? '#f43f5e' : '#c084fc', 'orb');
          }
        }
      }
      if (e.y > H + 60 || e.y < -90 || e.x < -70 || e.x > W + 70) enemies.splice(i, 1);
    }

    updateBoss(dt);

    // Update Enemy Bullets & Collision / Graze
    for (let i = eBullets.length - 1; i >= 0; i--) {
      const b = eBullets[i];
      b.age += dt;
      if (b.turnAt && !b.turned && b.age >= b.turnAt) {
        b.turned = true;
        const a = aimAngle(b.x, b.y, player.x, player.y);
        const sp = b.turnSpd || Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(a) * sp;
        b.vy = Math.sin(a) * sp;
        addParticles(b.x, b.y, b.color, 3, 70, 2.5);
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.bounces && b.bounces > 0) {
        if ((b.x < b.r && b.vx < 0) || (b.x > W - b.r && b.vx > 0)) {
          b.vx = -b.vx;
          b.bounces--;
        } else if (b.y < b.r && b.vy < 0) {
          b.vy = -b.vy;
          b.bounces--;
        }
      }

      const dist = Math.hypot(player.x - b.x, player.y - b.y);
      if (!b.grazed && dist < player.grazeR + b.r) {
        b.grazed = true;
        grazeCount++;
        score += 150;
        SoundFX.graze();
        addParticles((player.x + b.x) / 2, (player.y + b.y) / 2, '#fde047', 3, 100, 2.5);
      }
      if (player.invuln <= 0 && player.deathBombTimer <= 0 && dist < player.r + b.r * 0.72) {
        player.deathBombTimer = 0.14; // Brief death-bomb window
        eBullets.splice(i, 1);
        continue;
      }
      if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) eBullets.splice(i, 1);
    }

    // Update Lasers
    for (let i = lasers.length - 1; i >= 0; i--) {
      const ls = lasers[i];
      if (ls.warnTimer > 0) {
        ls.warnTimer -= dt;
        if (ls.warnTimer <= 0) SoundFX.kill();
      } else {
        ls.activeTimer -= dt;
        const dist = distToSegment(player.x, player.y, ls.x1, ls.y1, ls.x2, ls.y2);
        const halfW = ls.width * 0.36;
        if (!ls.grazed && dist < player.grazeR + halfW) {
          ls.grazed = true;
          grazeCount += 3;
          score += 450;
          SoundFX.graze();
        }
        if (player.invuln <= 0 && player.deathBombTimer <= 0 && dist < player.r + halfW) {
          player.deathBombTimer = 0.14;
        }
        if (ls.activeTimer <= 0) lasers.splice(i, 1);
      }
    }

    // Update Items (Auto-collect line at top 24% of screen)
    const autoCollect = player.y < H * 0.24;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (autoCollect) it.magnet = true;
      const dist = Math.hypot(player.x - it.x, player.y - it.y);
      if (dist < 65) it.magnet = true;
      if (it.magnet) {
        const a = aimAngle(it.x, it.y, player.x, player.y);
        it.x += Math.cos(a) * 520 * dt;
        it.y += Math.sin(a) * 520 * dt;
      } else {
        it.vy = Math.min(180, it.vy + 220 * dt);
        it.y += it.vy * dt;
      }
      if (dist < 22) {
        SoundFX.item();
        if (it.kind === 'power') {
          power = Math.min(4.0, +(power + 0.08).toFixed(2));
          score += 200;
        } else if (it.kind === 'star') {
          score += 500;
        } else {
          score += 350;
        }
        items.splice(i, 1);
      } else if (it.y > H + 30) {
        items.splice(i, 1);
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    updateHUD();
  }

  // --- Render ---
  function drawSprite(img, x, y, hSize) {
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const w = hSize * (img.naturalWidth / img.naturalHeight);
    ctx.drawImage(img, x - w / 2, y - hSize / 2, w, hSize);
  }

  function render() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // 1. Vertical Scrolling Background
    const bg = currentStage === 2 ? imgs.bg2 : imgs.bg;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.drawImage(bg, 0, bgScroll - H, W, H);
      ctx.drawImage(bg, 0, bgScroll, W, H);
    } else {
      ctx.fillStyle = '#09071a';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = (boss && boss.spellName) ? 'rgba(20, 4, 30, 0.55)' : 'rgba(6, 6, 18, 0.35)';
    ctx.fillRect(0, 0, W, H);

    // Spellcard Magic Circle behind boss
    if (boss && boss.spellName && !boss.purified) {
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(stageTime * 0.6);
      ctx.strokeStyle = boss.id === 'evilsweet' ? 'rgba(232, 121, 249, 0.42)' : 'rgba(244, 114, 182, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 120, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeRect(-85, -85, 170, 170);
      ctx.restore();
    }

    // 1.5 Lasers (Warning & Active Beams)
    lasers.forEach(ls => {
      ctx.save();
      if (ls.warnTimer > 0) {
        ctx.strokeStyle = ls.color;
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(stageTime * 24);
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(ls.x1, ls.y1); ctx.lineTo(ls.x2, ls.y2); ctx.stroke();
      } else {
        const a = Math.min(1, (ls.activeTimer / ls.maxActive) * 1.5);
        ctx.globalAlpha = a;
        ctx.lineCap = 'round';
        ctx.strokeStyle = ls.color;
        ctx.lineWidth = ls.width;
        ctx.beginPath(); ctx.moveTo(ls.x1, ls.y1); ctx.lineTo(ls.x2, ls.y2); ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = ls.width * 0.42;
        ctx.beginPath(); ctx.moveTo(ls.x1, ls.y1); ctx.lineTo(ls.x2, ls.y2); ctx.stroke();
      }
      ctx.restore();
    });

    // 2. Items
    items.forEach(it => {
      ctx.fillStyle = it.kind === 'power' ? '#fb7185' : (it.kind === 'star' ? '#fde047' : '#38bdf8');
      ctx.fillRect(it.x - 6, it.y - 6, 12, 12);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.kind === 'power' ? 'P' : (it.kind === 'star' ? '★' : '点'), it.x, it.y + 0.5);
    });

    // 3. Player Bullets
    pBullets.forEach(b => {
      ctx.save();
      ctx.fillStyle = b.color;
      ctx.globalAlpha = 0.78;
      if (b.kind === 'note') {
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('♪', b.x, b.y);
      } else {
        ctx.fillRect(b.x - 3, b.y - 9, 6, 18);
      }
      ctx.restore();
    });

    // 4. Enemies
    enemies.forEach(e => {
      const spr = e.kind === 'bat' ? imgs.bat
        : (e.kind === 'cupcake' ? imgs.cupcake
        : (e.kind === 'ofuda' ? imgs.ofuda : imgs.slime));
      drawSprite(spr, e.x, e.y, e.elite ? 74 : 50);
    });

    // 5. Boss
    if (boss) {
      const bob = Math.sin(stageTime * 3) * 6;
      const spr = boss.id === 'evilsweet'
        ? imgs.evilSd
        : (boss.purified ? imgs.bossGodSd : imgs.bossSkebeStand);
      if (!boss.purified) {
        ctx.save();
        const g = ctx.createRadialGradient(boss.x, boss.y + bob, 10, boss.x, boss.y + bob, 75);
        g.addColorStop(0, boss.id === 'evilsweet' ? 'rgba(232, 121, 249, 0.45)' : 'rgba(244, 114, 182, 0.45)');
        g.addColorStop(1, 'rgba(244, 114, 182, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(boss.x, boss.y + bob, 75, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      drawSprite(spr, boss.x, boss.y + bob, boss.purified ? 105 : 135);
    }

    // 6. Player (Shirane)
    if (player.invuln <= 0 || Math.floor(player.invuln * 16) % 2 === 0) {
      drawSprite(imgs.player, player.x, player.y, 70);
    }
    // Hitbox core on Shift, Mobile Slow, or Mouse Right Click
    if (keys['ShiftLeft'] || keys['ShiftRight'] || mobileSlow || mouseRightDown) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(stageTime * 2.5);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, player.r + 1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // 7. Enemy Bullets
    eBullets.forEach(b => {
      ctx.save();
      ctx.translate(b.x, b.y);
      if (b.shape === 'diamond') {
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.moveTo(b.r * 2.0, 0);
        ctx.lineTo(0, b.r * 0.95);
        ctx.lineTo(-b.r * 1.3, 0);
        ctx.lineTo(0, -b.r * 0.95);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(b.r * 1.1, 0);
        ctx.lineTo(0, b.r * 0.42);
        ctx.lineTo(-b.r * 0.65, 0);
        ctx.lineTo(0, -b.r * 0.42);
        ctx.closePath();
        ctx.fill();
      } else if (b.shape === 'bat') {
        const flap = Math.sin(b.age * 18) * 3;
        ctx.fillStyle = '#1e1b4b';
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 3);
        ctx.quadraticCurveTo(-b.r * 1.2, -b.r + flap, -b.r * 1.7, flap);
        ctx.quadraticCurveTo(-b.r * 0.8, 3, 0, 5);
        ctx.quadraticCurveTo(b.r * 0.8, 3, b.r * 1.7, flap);
        ctx.quadraticCurveTo(b.r * 1.2, -b.r + flap, 0, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fb7185';
        ctx.fillRect(-3, -1, 2, 2);
        ctx.fillRect(1, -1, 2, 2);
      } else if (b.shape === 'candy') {
        ctx.rotate(b.age * 4.5);
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let t = 0; t < 12; t++) {
          const ang = t * 0.6;
          const rad = (t / 12) * (b.r * 0.85);
          if (t === 0) ctx.moveTo(0, 0);
          else ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        ctx.stroke();
      } else if (b.shape === 'heart') {
        ctx.fillStyle = b.color;
        ctx.font = `bold ${Math.round(b.r * 2.4)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('♥', 0, 0);
      } else if (b.shape === 'note') {
        ctx.fillStyle = b.color;
        ctx.font = `bold ${Math.round(b.r * 2.5)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('♪', 0, 0);
      } else if (b.shape === 'star') {
        ctx.fillStyle = b.color;
        ctx.font = `bold ${Math.round(b.r * 2.4)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('★', 0, 0);
      } else {
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(0, 0, b.r + 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, b.r * 0.58, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });

    // 8. Particles
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // 9. Bomb Effect Ring
    if (activeBomb) {
      const prog = 1 - activeBomb.timer / activeBomb.maxTimer;
      ctx.save();
      ctx.strokeStyle = `rgba(56, 189, 248, ${1 - prog})`;
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(player.x, player.y, prog * 560, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // 10. Boss HUD (Top HP bar & Spell Name)
    if (boss && !boss.purified) {
      ctx.fillStyle = 'rgba(10, 6, 24, 0.75)';
      ctx.fillRect(16, 12, W - 32, 10);
      ctx.fillStyle = boss.spellName ? '#f472b6' : '#00f5d4';
      ctx.fillRect(18, 14, (W - 36) * Math.max(0, boss.hp / boss.maxHp), 6);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px "Yu Gothic UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${boss.name}  (${boss.maxPhases - boss.phase})`, 18, 36);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fde047';
      ctx.fillText(String(Math.ceil(boss.timer)), W - 18, 36);
      if (boss.spellName) {
        ctx.fillStyle = 'rgba(244, 114, 182, 0.85)';
        ctx.fillRect(W - 310, 44, 294, 22);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px "Yu Gothic UI", sans-serif';
        ctx.fillText(boss.spellName, W - 22, 59);
      }
    }

    // 11. Spellcard / Bomb Cutin
    if (cutin) {
      const p = 1 - cutin.timer / cutin.maxTimer;
      const alpha = p < 0.15 ? p / 0.15 : (p > 0.8 ? (1 - p) / 0.2 : 1);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha * 0.92);
      const img = imgs[cutin.imgKey];
      if (img && img.complete && img.naturalWidth > 0) {
        const ih = 320;
        const iw = ih * (img.naturalWidth / img.naturalHeight);
        const cx = cutin.side === 'left' ? 110 : W - 110;
        ctx.drawImage(img, cx - iw / 2, 160, iw, ih);
      }
      ctx.fillStyle = 'rgba(8, 8, 22, 0.85)';
      ctx.fillRect(0, 440, W, 36);
      ctx.fillStyle = cutin.color;
      ctx.font = 'bold 16px "Yu Gothic UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(cutin.name, W / 2, 463);
      ctx.restore();
    }

    // 12. Dialog Overlay
    if (state === 'dialog' && dialogQueue.length > 0) {
      const cur = dialogQueue[0];
      const isLeft = cur.speaker === 'shirane';
      // Left standing (Shirane)
      if (imgs.shiraneStand.complete) {
        ctx.save();
        ctx.globalAlpha = isLeft ? 1.0 : 0.45;
        drawSprite(imgs.shiraneStand, 125, H - 270, 340);
        ctx.restore();
      }
      // Right standing (ayataka / Evil Sweet)
      const rImg = cur.speaker === 'evilsweet'
        ? imgs.evilStand
        : (cur.speaker === 'ayataka_god' ? imgs.bossGodStand : imgs.bossSkebeStand);
      if (rImg && rImg.complete) {
        ctx.save();
        ctx.globalAlpha = !isLeft ? 1.0 : 0.45;
        drawSprite(rImg, W - 125, H - 270, 340);
        ctx.restore();
      }
      // Dialog box
      ctx.fillStyle = 'rgba(8, 10, 26, 0.92)';
      ctx.strokeStyle = isLeft ? '#38bdf8' : '#f472b6';
      ctx.lineWidth = 2.5;
      ctx.fillRect(18, H - 148, W - 36, 130);
      ctx.strokeRect(18, H - 148, W - 36, 130);

      ctx.fillStyle = isLeft ? '#38bdf8' : '#f472b6';
      ctx.font = 'bold 14px "Yu Gothic UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(cur.name, 34, H - 122);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '15px "Yu Gothic UI", sans-serif';
      wrapText(ctx, cur.text, 34, H - 94, W - 72, 22);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('▼ Z / Enter / クリックで次へ', W - 32, H - 30);
    }

    // 13. Stage Title Banner
    if (stageBanner) {
      const p = 1 - stageBanner.timer / stageBanner.maxTimer;
      const alpha = p < 0.18 ? p / 0.18 : (p > 0.78 ? (1 - p) / 0.22 : 1);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = 'rgba(6, 5, 18, 0.78)';
      ctx.fillRect(0, H * 0.36, W, 76);
      ctx.fillStyle = stageBanner.color;
      ctx.font = 'bold 19px "Yu Gothic UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(stageBanner.title, W / 2, H * 0.36 + 32);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '13px "Yu Gothic UI", sans-serif';
      ctx.fillText(stageBanner.sub, W / 2, H * 0.36 + 56);
      ctx.restore();
    }

    ctx.restore();
  }

  function wrapText(context, text, x, y, maxWidth, lineHeight) {
    let line = '';
    for (let i = 0; i < text.length; i++) {
      const test = line + text[i];
      if (context.measureText(test).width > maxWidth && i > 0) {
        context.fillText(line, x, y);
        line = text[i];
        y += lineHeight;
      } else {
        line = test;
      }
    }
    context.fillText(line, x, y);
  }

  // --- Loop ---
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  updateHUD();
  requestAnimationFrame(loop);
})();
