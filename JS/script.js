// Jogo da cobrinha - código simples e limpo
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Constants
const TILE = 20;                 // tamanho de cada célula
const COLS = canvas.width / TILE;
const ROWS = canvas.height / TILE;
const START_SPEED = 120;        // ms por tick

// Game state
let snake = [];
let dir = { x: 1, y: 0 }; // direção inicial: para a direita
let food = null;
let score = 0;
let highscore = 0;
let intervalId = null;
let speed = START_SPEED;
let running = false;
// Audio context for beeps (reused)
let audioCtx = null;

// Music state (background musiquinha)
let musicPlaying = false;
let musicOsc1 = null;
let musicOsc2 = null;
let musicGain = null;
let musicLead = null;
let musicInterval = null;

function startMusic() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        // master gain for music
        musicGain = audioCtx.createGain();
        musicGain.gain.value = 0.06; // baixo por padrão
        musicGain.connect(audioCtx.destination);

        // duas osciladores para um pad
        musicOsc1 = audioCtx.createOscillator();
        musicOsc2 = audioCtx.createOscillator();
        musicOsc1.type = 'sine';
        musicOsc2.type = 'sine';
        musicOsc1.frequency.value = 110; // A2
        musicOsc2.frequency.value = 220; // A3
        musicOsc2.detune.value = 8;
        musicOsc1.connect(musicGain);
        musicOsc2.connect(musicGain);
        musicOsc1.start();
        musicOsc2.start();

        // lead arpeggio (pequeno sequencer) para dar melodia
        const notes = [220, 246.94, 293.66, 329.63]; // A, B, D, E
        let idx = 0;
        const leadOsc = audioCtx.createOscillator();
        const leadGain = audioCtx.createGain();
        leadOsc.type = 'triangle';
        leadOsc.frequency.value = notes[0];
        leadGain.gain.value = 0.0001;
        leadOsc.connect(leadGain);
        leadGain.connect(audioCtx.destination);
        leadOsc.start();
        musicLead = { leadOsc, leadGain };

        musicInterval = setInterval(() => {
            const t = audioCtx.currentTime;
            const f = notes[idx % notes.length];
            musicLead.leadOsc.frequency.setValueAtTime(f, t);
            // envelope rápido
            musicLead.leadGain.gain.cancelScheduledValues(t);
            musicLead.leadGain.gain.setValueAtTime(0.0001, t);
            musicLead.leadGain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
            musicLead.leadGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
            idx++;
        }, 480);

        musicPlaying = true;
    } catch (e) {
        console.warn('startMusic error:', e);
    }
}

function stopMusic() {
    try {
        if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
        if (musicOsc1) { musicOsc1.stop(); musicOsc1.disconnect(); musicOsc1 = null; }
        if (musicOsc2) { musicOsc2.stop(); musicOsc2.disconnect(); musicOsc2 = null; }
        if (musicLead) { musicLead.leadOsc.stop(); musicLead.leadOsc.disconnect(); musicLead.leadGain.disconnect(); musicLead = null; }
        if (musicGain) { musicGain.disconnect(); musicGain = null; }
        musicPlaying = false;
    } catch (e) {
        console.warn('stopMusic error:', e);
    }
}

function playBeep(frequency = 880, duration = 0.08, type = 'sine', volume = 0.12) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = type;
        o.frequency.value = frequency;
        g.gain.value = volume;
        o.connect(g);
        g.connect(audioCtx.destination);
        const now = audioCtx.currentTime;
        g.gain.setValueAtTime(volume, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + duration);
        o.start(now);
        o.stop(now + duration + 0.02);
    } catch (e) {
        // Safari/older browsers might throw — ignore gracefully
        console.warn('playBeep error:', e);
    }
}

// DOM
const scoreEl = document.getElementById('score');
const highEl = document.getElementById('highscore');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const btnUp = document.getElementById('btnUp');
const btnDown = document.getElementById('btnDown');
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const musicBtn = document.getElementById('musicBtn');

// Inicialização
function init() {
    highscore = Number(localStorage.getItem('snake_high') || 0);
    highEl.textContent = highscore;
    resetGame();
    attachEvents();
}

function resetGame() {
    snake = [ { x: Math.floor(COLS/2)-1, y: Math.floor(ROWS/2) }, { x: Math.floor(COLS/2), y: Math.floor(ROWS/2) } ];
    dir = { x: 1, y: 0 };
    score = 0;
    speed = START_SPEED;
    placeFood();
    updateScore();
    render();
}

function placeFood() {
    while (true) {
        const fx = Math.floor(Math.random() * COLS);
        const fy = Math.floor(Math.random() * ROWS);
        // não deixar spawnar sobre a snake
        if (!snake.some(s => s.x === fx && s.y === fy)) {
            food = { x: fx, y: fy };
            break;
        }
    }
}

function updateScore() {
    scoreEl.textContent = score;
    highEl.textContent = highscore;
}

function gameTick() {
    // calcula nova cabeça
    const head = { x: snake[snake.length-1].x + dir.x, y: snake[snake.length-1].y + dir.y };

    // colisões com paredes
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
        return gameOver();
    }

    // colisão com si mesmo
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
        return gameOver();
    }

    // adiciona cabeça
    snake.push(head);

    // comer comida?
    if (food && head.x === food.x && head.y === food.y) {
        score += 10;
        // beep ao pegar a comida
        playBeep(880, 0.09, 'sine', 0.66);
        if (score > highscore) { highscore = score; localStorage.setItem('snake_high', highscore); }
        placeFood();
        updateScore();
        // opcional: acelera um pouco
        if (speed > 90) speed = Math.max(40, speed - 3);
        restartInterval();
    } else {
        // remove cauda
        snake.shift();
    }

    render();
}

function gameOver() {
    running = false;
    clearInterval(intervalId);
    intervalId = null;
    alert('Tecle espaço para mais uma chance! Score: ' + score);
}

function startGame() {
    if (running) return;
    running = true;
    restartInterval();
    // garantir que o canvas receba foco para entradas de teclado
    try { canvas.focus(); } catch (e) {}
}

function restartInterval() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(gameTick, speed);
}

function pauseGame() {
    if (!running) return;
    running = false;
    clearInterval(intervalId);
    intervalId = null;
}

function togglePause() {
    if (running) pauseGame(); else startGame();
}

// Rendering
function render() {
    // limpa
    ctx.fillStyle = '#0b6623';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // desenha comida
    if (food) {
        ctx.fillStyle = '#ffe347ff';
        ctx.fillRect(food.x * TILE, food.y * TILE, TILE, TILE);
    }

    // desenha snake
    for (let i = 0; i < snake.length; i++) {
        const s = snake[i];
        ctx.fillStyle = i === snake.length - 1 ? '#3d0a0aff' : '#a4e936ff';
        ctx.fillRect(s.x * TILE + 1, s.y * TILE + 1, TILE - 2, TILE - 2);
    }
}

// Controls
function setDirection(dx, dy) {
    // evitar inverter direção
    if (dx === -dir.x && dy === -dir.y) return;
    dir = { x: dx, y: dy };
}

function attachEvents() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
        const key = (e.key || '').toLowerCase();

        // tratar espaço: pausar/retomar e evitar scroll da página
        if (key === ' ' || key === 'space' || key === 'spacebar' || e.code === 'Space') {
            e.preventDefault();
            togglePause();
            return;
        }

        // evitar scroll/efeitos padrão para setas
        if (key.startsWith('arrow') || ['w','a','s','d'].includes(key)) {
            e.preventDefault();
        }

        if (key === 'arrowup' || key === 'w') setDirection(0, -1);
        if (key === 'arrowdown' || key === 's') setDirection(0, 1);
        if (key === 'arrowleft' || key === 'a') setDirection(-1, 0);
        if (key === 'arrowright' || key === 'd') setDirection(1, 0);
    });

    // Buttons (mouse/touch)
    btnUp.addEventListener('click', () => setDirection(0, -1));
    btnDown.addEventListener('click', () => setDirection(0, 1));
    btnLeft.addEventListener('click', () => setDirection(-1, 0));
    btnRight.addEventListener('click', () => setDirection(1, 0));

    // Start / Pause buttons
    startBtn.addEventListener('click', () => { resetGame(); startGame(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); });
    pauseBtn.addEventListener('click', () => togglePause());

    // Music toggle button
    if (musicBtn) {
        musicBtn.addEventListener('click', () => {
            // ensure AudioContext is allowed (user interaction)
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            if (!musicPlaying) {
                startMusic();
                musicBtn.setAttribute('aria-pressed', 'true');
                musicBtn.classList.add('active');
                musicBtn.textContent = '♪ on';
            } else {
                stopMusic();
                musicBtn.setAttribute('aria-pressed', 'false');
                musicBtn.classList.remove('active');
                musicBtn.textContent = '♪';
            }
        });
    }

    // Click canvas to pause/resume
    canvas.addEventListener('click', () => togglePause());

    // For accessibility: focus canvas to receive keyboard events
    canvas.addEventListener('keydown', (e) => {});

    // Allow clicking on canvas to set direction relative to head (simple heuristic)
    canvas.addEventListener('mousedown', (ev) => {
        const rect = canvas.getBoundingClientRect();
        const cx = ev.clientX - rect.left;
        const cy = ev.clientY - rect.top;
        const head = snake[snake.length - 1];
        const hx = head.x * TILE + TILE/2;
        const hy = head.y * TILE + TILE/2;
        const dx = cx - hx;
        const dy = cy - hy;
        if (Math.abs(dx) > Math.abs(dy)) {
            setDirection(dx > 0 ? 1 : -1, 0);
        } else {
            setDirection(0, dy > 0 ? 1 : -1);
        }
    });
}

// Inicializa tudo
init();

