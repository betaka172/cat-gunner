// ============================================================
// Cat Gunner - Shooting Game (Mobile + Desktop)
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ---- Responsive Canvas ----
const GAME_W = 900;
const GAME_H = 600;
canvas.width = GAME_W;
canvas.height = GAME_H;

// ---- Mobile Detection ----
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

function initControlsDisplay() {
    if (isTouchDevice) {
        document.getElementById('controls-touch').style.display = 'flex';
        document.getElementById('controls-keyboard').style.display = 'none';
        document.getElementById('touch-controls').style.display = 'block';
    }
}

// ---- Game State ----
const game = {
    running: false,
    score: 0,
    highScore: parseInt(localStorage.getItem('catGunnerHighScore') || '0'),
    lives: 3,
    wave: 1,
    waveTimer: 0,
    waveInterval: 1200,
    enemySpawnTimer: 0,
    enemySpawnInterval: 80,
    starfieldOffset: 0,
    shakeTimer: 0,
    shakeIntensity: 0,
};

// ---- Sound Manager (Web Audio API) ----
const soundManager = {
    ctx: null,
    masterGain: null,
    bgmGain: null,
    sfxGain: null,
    muted: false,
    bgmPlaying: false,
    bgmIntervalId: null,
    noiseBuffer: null,
    initialized: false,

    init() {
        if (this.initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.bgmGain = this.ctx.createGain();
            this.sfxGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.5;
            this.bgmGain.gain.value = 0.3;
            this.sfxGain.gain.value = 0.6;
            this.bgmGain.connect(this.masterGain);
            this.sfxGain.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);
            this.ctx.resume();
            this.noiseBuffer = this.createNoiseBuffer(1);
            this.initialized = true;
        } catch (e) { /* Web Audio not supported */ }
    },

    createNoiseBuffer(duration) {
        const sr = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, sr * duration, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    },

    playShoot() {
        if (!this.initialized || this.muted) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.1);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(g); g.connect(this.sfxGain);
        osc.start(t); osc.stop(t + 0.1);
    },

    playEnemyDefeat(isBoss) {
        if (!this.initialized || this.muted) return;
        const t = this.ctx.currentTime;
        const dur = isBoss ? 0.5 : 0.2;
        // Noise burst
        const ns = this.ctx.createBufferSource();
        ns.buffer = this.noiseBuffer;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(isBoss ? 0.5 : 0.3, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'bandpass'; flt.frequency.value = isBoss ? 400 : 800; flt.Q.value = 1;
        ns.connect(flt); flt.connect(ng); ng.connect(this.sfxGain);
        ns.start(t); ns.stop(t + dur);
        // Low thud
        const osc = this.ctx.createOscillator();
        const og = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isBoss ? 40 : 80, t);
        osc.frequency.exponentialRampToValueAtTime(20, t + dur);
        og.gain.setValueAtTime(0.4, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(og); og.connect(this.sfxGain);
        osc.start(t); osc.stop(t + dur);
    },

    playItemPickup() {
        if (!this.initialized || this.muted) return;
        const t = this.ctx.currentTime;
        [523, 659, 784].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = freq;
            g.gain.setValueAtTime(0, t + i * 0.08);
            g.gain.linearRampToValueAtTime(0.3, t + i * 0.08 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.12);
            osc.connect(g); g.connect(this.sfxGain);
            osc.start(t + i * 0.08); osc.stop(t + i * 0.08 + 0.12);
        });
    },

    playBossRoar() {
        if (!this.initialized || this.muted) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, t);
        osc.frequency.linearRampToValueAtTime(40, t + 0.8);
        const lfo = this.ctx.createOscillator();
        const lfoG = this.ctx.createGain();
        lfo.type = 'triangle'; lfo.frequency.value = 8; lfoG.gain.value = 20;
        lfo.connect(lfoG); lfoG.connect(osc.frequency);
        const dist = this.ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const x = (i * 2) / 256 - 1; curve[i] = (Math.PI + 100) * x / (Math.PI + 100 * Math.abs(x)); }
        dist.curve = curve; dist.oversample = '2x';
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.4, t + 0.05);
        g.gain.setValueAtTime(0.4, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        osc.connect(dist); dist.connect(g); g.connect(this.sfxGain);
        lfo.start(t); lfo.stop(t + 0.8);
        osc.start(t); osc.stop(t + 0.8);
    },

    playCharacterVoice(type) {
        if (!this.initialized || this.muted) return;
        const t = this.ctx.currentTime;
        const cfgs = {
            start:  { f1: 800, f2: 1200, dur: 0.15, sw: 1.0 },
            damage: { f1: 700, f2: 1800, dur: 0.1, sw: 0.7 },
            death:  { f1: 600, f2: 1000, dur: 0.4, sw: 0.4 },
        };
        const c = cfgs[type] || cfgs.start;
        [c.f1, c.f2].forEach(freq => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const flt = this.ctx.createBiquadFilter();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, t);
            osc.frequency.exponentialRampToValueAtTime(Math.max(freq * c.sw, 20), t + c.dur);
            flt.type = 'bandpass'; flt.frequency.value = freq; flt.Q.value = 5;
            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime(0.15, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + c.dur);
            osc.connect(flt); flt.connect(g); g.connect(this.sfxGain);
            osc.start(t); osc.stop(t + c.dur);
        });
    },

    playDamage() {
        if (!this.initialized || this.muted) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'square'; osc.frequency.value = 200;
        g.gain.setValueAtTime(0.3, t);
        g.gain.setValueAtTime(0, t + 0.05);
        g.gain.setValueAtTime(0.3, t + 0.1);
        g.gain.setValueAtTime(0, t + 0.15);
        g.gain.setValueAtTime(0.3, t + 0.2);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(g); g.connect(this.sfxGain);
        osc.start(t); osc.stop(t + 0.3);
    },

    startBGM() {
        if (!this.initialized || this.bgmPlaying) return;
        this.bgmPlaying = true;
        let step = 0;
        const melody = [262,262,330,392,440,440,392,0,330,330,262,330,392,330,262,0];
        const bass =   [131,0,131,0,175,0,175,0,196,0,196,0,131,0,131,0];
        this.bgmIntervalId = setInterval(() => {
            if (this.muted || !this.bgmPlaying || !this.ctx) return;
            const t = this.ctx.currentTime;
            const idx = step % melody.length;
            if (melody[idx] > 0) {
                const o = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                o.type = 'square'; o.frequency.value = melody[idx];
                g.gain.setValueAtTime(0.12, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
                o.connect(g); g.connect(this.bgmGain);
                o.start(t); o.stop(t + 0.12);
            }
            if (bass[idx] > 0) {
                const o = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                o.type = 'triangle'; o.frequency.value = bass[idx];
                g.gain.setValueAtTime(0.1, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
                o.connect(g); g.connect(this.bgmGain);
                o.start(t); o.stop(t + 0.12);
            }
            step++;
        }, 125);
    },

    stopBGM() {
        this.bgmPlaying = false;
        if (this.bgmIntervalId) { clearInterval(this.bgmIntervalId); this.bgmIntervalId = null; }
    },

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : 0.5;
        const btn = document.getElementById('mute-btn');
        if (btn) { btn.textContent = this.muted ? '\u{1F507}' : '\u{1F50A}'; btn.classList.toggle('muted', this.muted); }
    }
};

// ---- Keyboard Input ----
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
    }
    if (e.code === 'KeyM') { if (!soundManager.initialized) soundManager.init(); soundManager.toggleMute(); }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ---- Touch Input ----
const touchState = {
    joystickActive: false,
    joystickDx: 0,
    joystickDy: 0,
    joystickTouchId: null,
    fireActive: false,
    fireTouchId: null,
};

function initTouchControls() {
    if (!isTouchDevice) return;

    const joystickZone = document.getElementById('joystick-zone');
    const joystickBase = document.getElementById('joystick-base');
    const joystickThumb = document.getElementById('joystick-thumb');
    const fireBtnZone = document.getElementById('fire-btn-zone');
    const fireBtn = document.getElementById('fire-btn');

    const maxDist = 40; // max thumb travel from center

    function getJoystickCenter() {
        const rect = joystickBase.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    // Joystick events
    joystickZone.addEventListener('touchstart', e => {
        e.preventDefault();
        if (touchState.joystickTouchId !== null) return;
        const touch = e.changedTouches[0];
        touchState.joystickTouchId = touch.identifier;
        touchState.joystickActive = true;
        updateJoystick(touch);
    }, { passive: false });

    joystickZone.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchState.joystickTouchId) {
                updateJoystick(touch);
            }
        }
    }, { passive: false });

    function endJoystick(e) {
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchState.joystickTouchId) {
                touchState.joystickActive = false;
                touchState.joystickDx = 0;
                touchState.joystickDy = 0;
                touchState.joystickTouchId = null;
                joystickThumb.style.transform = 'translate(0px, 0px)';
            }
        }
    }

    joystickZone.addEventListener('touchend', endJoystick);
    joystickZone.addEventListener('touchcancel', endJoystick);

    function updateJoystick(touch) {
        const center = getJoystickCenter();
        let dx = touch.clientX - center.x;
        let dy = touch.clientY - center.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }
        // Normalize to -1..1
        touchState.joystickDx = dx / maxDist;
        touchState.joystickDy = dy / maxDist;
        joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    // Fire button events
    fireBtnZone.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touchState.fireTouchId === null) {
                touchState.fireTouchId = touch.identifier;
                touchState.fireActive = true;
                fireBtn.classList.add('active');
            }
        }
    }, { passive: false });

    function endFire(e) {
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchState.fireTouchId) {
                touchState.fireActive = false;
                touchState.fireTouchId = null;
                fireBtn.classList.remove('active');
            }
        }
    }

    fireBtnZone.addEventListener('touchend', endFire);
    fireBtnZone.addEventListener('touchcancel', endFire);

    // Prevent context menu on long press
    document.addEventListener('contextmenu', e => e.preventDefault());
}

// ---- Stars (background) ----
const stars = [];
function initStars() {
    stars.length = 0;
    for (let i = 0; i < 120; i++) {
        stars.push({
            x: Math.random() * GAME_W,
            y: Math.random() * GAME_H,
            size: Math.random() * 2 + 0.5,
            speed: Math.random() * 1.5 + 0.3,
            brightness: Math.random() * 0.5 + 0.5,
        });
    }
}

// ---- Player (Cat Character) ----
const player = {
    x: 80,
    y: 300,
    width: 60,
    height: 60,
    speed: 4.5,
    fireRate: 12,
    fireTimer: 0,
    invincible: 0,
    thrustAnim: 0,
};

// ---- Bullets, Enemies, Particles, PowerUps ----
let bullets = [];
let enemies = [];
let particles = [];
let powerUps = [];
let damageFlash = 0;

// ---- Draw Cat Character ----
function drawCat(x, y, w, h, invincible) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const scale = w / 60;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    if (invincible > 0 && Math.floor(invincible / 4) % 2 === 0) {
        ctx.globalAlpha = 0.4;
    }

    // Leather jacket (body)
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.ellipse(0, 8, 22, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Jacket collar
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.ellipse(0, -4, 16, 8, 0, 0, Math.PI);
    ctx.fill();

    // Jacket zipper line
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(0, 20);
    ctx.stroke();

    // Red pin on jacket
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(8, 4, 3, 0, Math.PI * 2);
    ctx.fill();

    // Necklace chain
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -2, 10, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Necklace pendant
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(0, 8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Head (fur)
    const gradient = ctx.createRadialGradient(0, -14, 4, 0, -14, 18);
    gradient.addColorStop(0, '#c88050');
    gradient.addColorStop(0.6, '#8B5A2B');
    gradient.addColorStop(1, '#5a3518');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, -14, 17, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = '#8B5A2B';
    ctx.beginPath();
    ctx.moveTo(-14, -24); ctx.lineTo(-8, -34); ctx.lineTo(-4, -24);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -24); ctx.lineTo(8, -34); ctx.lineTo(4, -24);
    ctx.closePath(); ctx.fill();

    // Inner ears
    ctx.fillStyle = '#d4956b';
    ctx.beginPath();
    ctx.moveTo(-12, -25); ctx.lineTo(-8, -31); ctx.lineTo(-6, -25);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(12, -25); ctx.lineTo(8, -31); ctx.lineTo(6, -25);
    ctx.closePath(); ctx.fill();

    // Dark forehead stripe
    ctx.fillStyle = '#5a3518';
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.quadraticCurveTo(-3, -22, 0, -16);
    ctx.quadraticCurveTo(3, -22, 0, -30);
    ctx.fill();

    // Sunglasses
    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(-8, -16, 9, 7, -0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(8, -16, 9, 7, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1, -16); ctx.lineTo(1, -16); ctx.stroke();

    // Lens reflection
    ctx.fillStyle = 'rgba(30, 120, 220, 0.35)';
    ctx.beginPath(); ctx.ellipse(-8, -16, 8, 6, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8, -16, 8, 6, 0.1, 0, Math.PI * 2); ctx.fill();

    // Lens shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath(); ctx.ellipse(-10, -19, 3, 2, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(6, -19, 3, 2, -0.3, 0, Math.PI * 2); ctx.fill();

    // Nose
    ctx.fillStyle = '#d4776b';
    ctx.beginPath(); ctx.ellipse(0, -8, 3, 2.5, 0, 0, Math.PI * 2); ctx.fill();

    // Mouth
    ctx.strokeStyle = '#5a3518'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(-4, -2, -7, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(4, -2, 7, -4); ctx.stroke();

    // Whiskers
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-10, -9); ctx.lineTo(-24, -13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(-24, -7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(-24, -1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -9); ctx.lineTo(24, -13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -7); ctx.lineTo(24, -7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -5); ctx.lineTo(24, -1); ctx.stroke();

    // Thrust flame
    player.thrustAnim += 0.3;
    const flameLen = 8 + Math.sin(player.thrustAnim) * 5;
    const flameGrad = ctx.createLinearGradient(-30, 8, -30 - flameLen, 8);
    flameGrad.addColorStop(0, 'rgba(255, 150, 50, 0.9)');
    flameGrad.addColorStop(0.5, 'rgba(255, 80, 20, 0.6)');
    flameGrad.addColorStop(1, 'rgba(255, 30, 10, 0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-22, 2); ctx.lineTo(-22 - flameLen, 8); ctx.lineTo(-22, 14);
    ctx.closePath(); ctx.fill();

    ctx.restore();
}

// ---- Draw Pen Bullet ----
function drawBullet(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const grad = ctx.createLinearGradient(0, -3, 0, 3);
    grad.addColorStop(0, '#4a5568');
    grad.addColorStop(0.5, '#2d3748');
    grad.addColorStop(1, '#1a202c');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(-10, -3, 20, 6, 2); ctx.fill();
    ctx.fillStyle = '#c0c0c0';
    ctx.beginPath(); ctx.moveTo(10, -2); ctx.lineTo(16, 0); ctx.lineTo(10, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#718096'; ctx.fillRect(-6, -4, 4, 1);
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#00aaff';
    ctx.beginPath(); ctx.ellipse(-8, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// ---- Enemy Types ----
function createEnemy(type) {
    const baseY = 40 + Math.random() * (GAME_H - 80);
    switch (type) {
        case 'drone':
            return { type: 'drone', x: GAME_W + 30, y: baseY, width: 36, height: 36,
                speed: 1.8 + game.wave * 0.15, hp: 1, maxHp: 1, score: 100,
                animTimer: Math.random() * Math.PI * 2, movePattern: 'sine', baseY };
        case 'tank':
            return { type: 'tank', x: GAME_W + 30, y: baseY, width: 48, height: 40,
                speed: 1.0 + game.wave * 0.08, hp: 3, maxHp: 3, score: 300,
                animTimer: Math.random() * Math.PI * 2, movePattern: 'straight', baseY };
        case 'fast':
            return { type: 'fast', x: GAME_W + 30, y: baseY, width: 28, height: 28,
                speed: 3.5 + game.wave * 0.2, hp: 1, maxHp: 1, score: 150,
                animTimer: Math.random() * Math.PI * 2, movePattern: 'zigzag', baseY };
        case 'boss':
            return { type: 'boss', x: GAME_W + 40, y: GAME_H / 2, width: 80, height: 70,
                speed: 0.5, hp: 15 + game.wave * 5, maxHp: 15 + game.wave * 5, score: 2000,
                animTimer: 0, movePattern: 'boss', baseY: GAME_H / 2, shootTimer: 0 };
        default:
            return createEnemy('drone');
    }
}

function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    e.animTimer += 0.05;
    const hitFlash = e.hitFlash > 0;
    if (hitFlash) e.hitFlash--;

    if (e.type === 'drone') {
        ctx.fillStyle = hitFlash ? '#fff' : '#8e44ad';
        ctx.beginPath(); ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = hitFlash ? '#fff' : '#9b59b6';
        ctx.beginPath(); ctx.ellipse(0, -3, 10, 8, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = hitFlash ? '#fff' : 'rgba(180, 130, 255, 0.6)';
        ctx.beginPath(); ctx.ellipse(0, -6, 6, 6, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(0, -1, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.arc(0, -1, 1.5, 0, Math.PI * 2); ctx.fill();
        for (let i = -2; i <= 2; i++) {
            ctx.fillStyle = `hsl(${(e.animTimer * 100 + i * 60) % 360}, 100%, 70%)`;
            ctx.beginPath(); ctx.arc(i * 6, 4, 2, 0, Math.PI * 2); ctx.fill();
        }
    } else if (e.type === 'tank') {
        ctx.fillStyle = hitFlash ? '#fff' : '#c0392b';
        ctx.beginPath();
        ctx.moveTo(-24, 0); ctx.lineTo(-16, -16); ctx.lineTo(16, -16);
        ctx.lineTo(24, -8); ctx.lineTo(24, 8); ctx.lineTo(16, 16); ctx.lineTo(-16, 16);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = hitFlash ? '#fff' : '#e74c3c'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = hitFlash ? '#fff' : '#922b21';
        ctx.fillRect(-14, -12, 28, 4); ctx.fillRect(-14, 8, 28, 4);
        ctx.fillStyle = '#ff6b6b';
        const pulse = 3 + Math.sin(e.animTimer * 2) * 1.5;
        ctx.beginPath(); ctx.arc(0, 0, pulse, 0, Math.PI * 2); ctx.fill();
        if (e.hp < e.maxHp) {
            ctx.fillStyle = '#333'; ctx.fillRect(-20, -22, 40, 4);
            ctx.fillStyle = '#2ecc71'; ctx.fillRect(-20, -22, 40 * (e.hp / e.maxHp), 4);
        }
    } else if (e.type === 'fast') {
        ctx.fillStyle = hitFlash ? '#fff' : '#e67e22';
        ctx.beginPath();
        ctx.moveTo(14, 0); ctx.lineTo(-10, -12); ctx.lineTo(-6, 0); ctx.lineTo(-10, 12);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.4; ctx.fillStyle = '#f39c12';
        ctx.beginPath(); ctx.ellipse(10, 0, 4 + Math.sin(e.animTimer * 3) * 2, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
    } else if (e.type === 'boss') {
        const bPulse = Math.sin(e.animTimer) * 0.05;
        ctx.scale(1 + bPulse, 1 + bPulse);
        ctx.fillStyle = hitFlash ? '#fff' : '#1a1a2e';
        ctx.beginPath();
        ctx.moveTo(-40, 0); ctx.lineTo(-30, -28); ctx.lineTo(10, -30);
        ctx.lineTo(35, -15); ctx.lineTo(40, 0); ctx.lineTo(35, 15);
        ctx.lineTo(10, 30); ctx.lineTo(-30, 28);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = hitFlash ? '#fff' : '#6c3483'; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = '#8e44ad'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-25, -20); ctx.lineTo(25, -10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-25, 20); ctx.lineTo(25, 10); ctx.stroke();
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.arc(-5, -10, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(-5, 10, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-5, -10, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(-5, 10, 3, 0, Math.PI * 2); ctx.fill();
        const cannonGlow = 5 + Math.sin(e.animTimer * 3) * 3;
        ctx.fillStyle = `rgba(255, 50, 50, ${0.3 + Math.sin(e.animTimer * 3) * 0.2})`;
        ctx.beginPath(); ctx.arc(38, 0, cannonGlow, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333'; ctx.fillRect(-35, -38, 70, 6);
        ctx.fillStyle = e.hp / e.maxHp > 0.3 ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(-35, -38, 70 * (e.hp / e.maxHp), 6);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(-35, -38, 70, 6);
    }
    ctx.restore();
}

// ---- Particles ----
function spawnExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        particles.push({
            x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            life: 30 + Math.random() * 20, maxLife: 30 + Math.random() * 20,
            size: Math.random() * 4 + 1, color,
        });
    }
}

function spawnScorePopup(x, y, score) {
    particles.push({
        x, y, vx: 0, vy: -1.5, life: 40, maxLife: 40,
        size: 0, color: '#ffd700', text: `+${score}`, isText: true,
    });
}

// ---- PowerUps ----
function spawnPowerUp(x, y) {
    if (Math.random() > 0.15) return;
    const types = ['rapid', 'heal', 'spread'];
    const type = types[Math.floor(Math.random() * types.length)];
    powerUps.push({ x, y, type, width: 24, height: 24, life: 300, animTimer: 0 });
}

function drawPowerUp(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    p.animTimer += 0.08;
    ctx.translate(0, Math.sin(p.animTimer) * 3);
    ctx.globalAlpha = 0.3 + Math.sin(p.animTimer) * 0.1;
    const colors = { rapid: '#00aaff', heal: '#2ecc71', spread: '#f39c12' };
    ctx.fillStyle = colors[p.type];
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors[p.type];
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const symbols = { rapid: 'R', heal: '+', spread: 'S' };
    ctx.fillText(symbols[p.type], 0, 0);
    ctx.restore();
}

// ---- Boss Bullets ----
let enemyBullets = [];

function drawEnemyBullet(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = '#ff4444';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 100, 100, 0.4)';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// ---- Collision Detection ----
function rectCollision(a, b) {
    return a.x - a.width / 2 < b.x + b.width / 2 &&
           a.x + a.width / 2 > b.x - b.width / 2 &&
           a.y - a.height / 2 < b.y + b.height / 2 &&
           a.y + a.height / 2 > b.y - b.height / 2;
}

// ---- PowerUp Effect State ----
let rapidFireTimer = 0;
let spreadShotTimer = 0;

// ---- Update ----
function update() {
    if (!game.running) return;

    game.starfieldOffset += 0.5;

    // Player movement (keyboard + touch)
    let moveX = 0, moveY = 0;

    if (keys['ArrowUp'] || keys['KeyW']) moveY -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) moveY += 1;
    if (keys['ArrowLeft'] || keys['KeyA']) moveX -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) moveX += 1;

    // Touch joystick input
    if (touchState.joystickActive) {
        moveX += touchState.joystickDx;
        moveY += touchState.joystickDy;
    }

    // Apply deadzone for joystick
    const moveMag = Math.hypot(moveX, moveY);
    if (moveMag > 0.15) {
        const norm = Math.min(moveMag, 1);
        player.x += (moveX / moveMag) * norm * player.speed;
        player.y += (moveY / moveMag) * norm * player.speed;
    }

    // Clamp player position
    player.x = Math.max(player.width / 2, Math.min(GAME_W - player.width / 2, player.x));
    player.y = Math.max(player.height / 2, Math.min(GAME_H - player.height / 2, player.y));

    // Fire bullets (keyboard or touch)
    if (player.fireTimer > 0) player.fireTimer--;
    if (rapidFireTimer > 0) rapidFireTimer--;
    if (spreadShotTimer > 0) spreadShotTimer--;

    const currentFireRate = rapidFireTimer > 0 ? 4 : player.fireRate;
    const wantFire = keys['Space'] || touchState.fireActive;

    if (wantFire && player.fireTimer <= 0) {
        player.fireTimer = currentFireRate;
        soundManager.playShoot();
        if (spreadShotTimer > 0) {
            for (let angle = -0.2; angle <= 0.2; angle += 0.2) {
                bullets.push({
                    x: player.x + 30, y: player.y,
                    vx: 8 * Math.cos(angle), vy: 8 * Math.sin(angle),
                    width: 16, height: 6,
                });
            }
        } else {
            bullets.push({
                x: player.x + 30, y: player.y,
                vx: 8, vy: 0, width: 16, height: 6,
            });
        }
    }

    // Update bullets
    bullets = bullets.filter(b => {
        b.x += b.vx; b.y += b.vy;
        return b.x < GAME_W + 20 && b.x > -20 && b.y > -20 && b.y < GAME_H + 20;
    });

    // Spawn enemies
    game.enemySpawnTimer++;
    game.waveTimer++;

    const spawnRate = Math.max(30, game.enemySpawnInterval - game.wave * 5);
    if (game.enemySpawnTimer >= spawnRate) {
        game.enemySpawnTimer = 0;
        const rand = Math.random();
        if (rand < 0.5) enemies.push(createEnemy('drone'));
        else if (rand < 0.75) enemies.push(createEnemy('fast'));
        else enemies.push(createEnemy('tank'));
    }

    // Wave progression
    if (game.waveTimer >= game.waveInterval) {
        game.waveTimer = 0;
        game.wave++;
        document.getElementById('wave').textContent = game.wave;
        if (game.wave % 3 === 0) { enemies.push(createEnemy('boss')); soundManager.playBossRoar(); }
    }

    // Update enemies
    enemies = enemies.filter(e => {
        e.x -= e.speed;

        if (e.movePattern === 'sine') e.y = e.baseY + Math.sin(e.animTimer * 2) * 30;
        else if (e.movePattern === 'zigzag') e.y = e.baseY + Math.sin(e.animTimer * 4) * 50;
        else if (e.movePattern === 'boss') {
            if (e.x < GAME_W - 100) e.x = GAME_W - 100;
            e.y = GAME_H / 2 + Math.sin(e.animTimer * 0.8) * 150;
            e.shootTimer++;
            if (e.shootTimer >= 30) {
                e.shootTimer = 0;
                const angle = Math.atan2(player.y - e.y, player.x - e.x);
                enemyBullets.push({ x: e.x - 40, y: e.y, vx: Math.cos(angle) * 4, vy: Math.sin(angle) * 4 });
            }
        }

        if (e.x < -60) return false;

        for (let i = bullets.length - 1; i >= 0; i--) {
            if (rectCollision(bullets[i], e)) {
                e.hp--; e.hitFlash = 6;
                bullets.splice(i, 1);
                spawnExplosion(e.x, e.y, '#ff8800', 4);
                if (e.hp <= 0) {
                    soundManager.playEnemyDefeat(e.type === 'boss');
                    game.score += e.score;
                    document.getElementById('score').textContent = game.score;
                    spawnExplosion(e.x, e.y, e.type === 'boss' ? '#ff00ff' : '#ff4400', e.type === 'boss' ? 40 : 15);
                    spawnScorePopup(e.x, e.y, e.score);
                    spawnPowerUp(e.x, e.y);
                    if (e.type === 'boss') { game.shakeTimer = 20; game.shakeIntensity = 8; }
                    return false;
                }
                break;
            }
        }

        if (player.invincible <= 0) {
            const pr = { x: player.x, y: player.y, width: player.width * 0.6, height: player.height * 0.6 };
            if (rectCollision(pr, e)) { takeDamage(); return e.type === 'boss'; }
        }
        return true;
    });

    // Update enemy bullets
    enemyBullets = enemyBullets.filter(b => {
        b.x += b.vx; b.y += b.vy;
        if (b.x < -20 || b.x > GAME_W + 20 || b.y < -20 || b.y > GAME_H + 20) return false;
        if (player.invincible <= 0) {
            if (Math.hypot(b.x - player.x, b.y - player.y) < 20) { takeDamage(); return false; }
        }
        return true;
    });

    // Update power-ups
    powerUps = powerUps.filter(p => {
        p.life--;
        if (p.life <= 0) return false;
        if (Math.hypot(p.x - player.x, p.y - player.y) < 30) {
            soundManager.playItemPickup();
            if (p.type === 'rapid') rapidFireTimer = 300;
            else if (p.type === 'heal') { game.lives = Math.min(5, game.lives + 1); updateLivesDisplay(); }
            else if (p.type === 'spread') spreadShotTimer = 300;
            spawnExplosion(p.x, p.y, '#ffd700', 10);
            return false;
        }
        return true;
    });

    // Update particles
    particles = particles.filter(p => {
        p.x += p.vx; p.y += p.vy; p.life--;
        if (!p.isText) { p.vx *= 0.96; p.vy *= 0.96; }
        return p.life > 0;
    });

    if (player.invincible > 0) player.invincible--;
    if (damageFlash > 0) damageFlash--;
    if (game.shakeTimer > 0) game.shakeTimer--;
}

function takeDamage() {
    soundManager.playDamage();
    soundManager.playCharacterVoice('damage');
    game.lives--;
    player.invincible = 90;
    damageFlash = 10;
    game.shakeTimer = 10;
    game.shakeIntensity = 5;
    spawnExplosion(player.x, player.y, '#ff0000', 12);
    updateLivesDisplay();
    if (game.lives <= 0) gameOver();
}

// ---- Draw ----
function draw() {
    ctx.save();

    if (game.shakeTimer > 0) {
        const shake = game.shakeIntensity * (game.shakeTimer / 20);
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, GAME_H);
    bgGrad.addColorStop(0, '#0a0a2e');
    bgGrad.addColorStop(0.5, '#0d1b3e');
    bgGrad.addColorStop(1, '#0a0a2e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Stars
    stars.forEach(s => {
        s.x -= s.speed;
        if (s.x < 0) { s.x = GAME_W; s.y = Math.random() * GAME_H; }
        const twinkle = 0.5 + Math.sin(s.x * 0.01 + game.starfieldOffset * 0.05) * 0.3;
        ctx.globalAlpha = s.brightness * twinkle;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    if (damageFlash > 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${damageFlash * 0.03})`;
        ctx.fillRect(0, 0, GAME_W, GAME_H);
    }

    powerUps.forEach(drawPowerUp);
    enemyBullets.forEach(drawEnemyBullet);
    enemies.forEach(drawEnemy);
    bullets.forEach(drawBullet);

    drawCat(player.x - player.width / 2, player.y - player.height / 2, player.width, player.height, player.invincible);

    // Power-up indicators
    if (rapidFireTimer > 0 || spreadShotTimer > 0) {
        ctx.font = '12px monospace'; ctx.textAlign = 'left';
        let iy = GAME_H - 20;
        if (rapidFireTimer > 0) { ctx.fillStyle = '#00aaff'; ctx.fillText(`RAPID FIRE: ${Math.ceil(rapidFireTimer / 60)}s`, 10, iy); iy -= 18; }
        if (spreadShotTimer > 0) { ctx.fillStyle = '#f39c12'; ctx.fillText(`SPREAD SHOT: ${Math.ceil(spreadShotTimer / 60)}s`, 10, iy); }
    }

    // Particles
    particles.forEach(p => {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        if (p.isText) {
            ctx.fillStyle = p.color; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
            ctx.fillText(p.text, p.x, p.y);
        } else {
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2); ctx.fill();
        }
    });
    ctx.globalAlpha = 1;
    ctx.restore();
}

// ---- Lives Display ----
function updateLivesDisplay() {
    const container = document.getElementById('lives-display');
    container.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        const icon = document.createElement('div');
        icon.className = 'life-icon' + (i >= game.lives ? ' lost' : '');
        container.appendChild(icon);
    }
}

// ---- Game Flow ----
function startGame() {
    game.running = true;
    game.score = 0;
    game.lives = 3;
    game.wave = 1;
    game.waveTimer = 0;
    game.enemySpawnTimer = 0;
    player.x = 80;
    player.y = GAME_H / 2;
    player.invincible = 60;
    bullets = []; enemies = []; particles = []; powerUps = []; enemyBullets = [];
    rapidFireTimer = 0; spreadShotTimer = 0; damageFlash = 0; game.shakeTimer = 0;

    document.getElementById('score').textContent = '0';
    document.getElementById('wave').textContent = '1';
    updateLivesDisplay();

    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('gameover-screen').style.display = 'none';

    if (!soundManager.initialized) soundManager.init();
    soundManager.playCharacterVoice('start');
    soundManager.startBGM();
}

function gameOver() {
    soundManager.stopBGM();
    soundManager.playCharacterVoice('death');
    game.running = false;
    if (game.score > game.highScore) {
        game.highScore = game.score;
        localStorage.setItem('catGunnerHighScore', game.highScore.toString());
    }
    document.getElementById('final-score').textContent = game.score;
    document.getElementById('high-score').textContent = game.highScore;
    document.getElementById('gameover-screen').style.display = 'flex';
}

// ---- Main Loop ----
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// ---- Initialize ----
initStars();
updateLivesDisplay();
initControlsDisplay();
initTouchControls();

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('retry-btn').addEventListener('click', startGame);
document.getElementById('mute-btn').addEventListener('click', () => { if (!soundManager.initialized) soundManager.init(); soundManager.toggleMute(); });

window.addEventListener('keydown', e => {
    if (e.code === 'Enter' || e.code === 'Space') {
        const startScreen = document.getElementById('start-screen');
        const gameoverScreen = document.getElementById('gameover-screen');
        if (startScreen.style.display !== 'none' && getComputedStyle(startScreen).display !== 'none') {
            e.preventDefault(); startGame();
        } else if (gameoverScreen.style.display === 'flex') {
            e.preventDefault(); startGame();
        }
    }
});

// Prevent pinch zoom and pull-to-refresh on the whole page
document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

gameLoop();
