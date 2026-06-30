const TOTAL_ROUNDS = 15;

let round = 0;
let score = 0;
let difficulty;
let waveform;

let freq1;
let freq2;

let answered = false;
let played = false;

let correctHistory = [];

let audioCtx;

const playBtn = document.getElementById("playBtn");
const nextBtn = document.getElementById("nextBtn");
const tone1Btn = document.getElementById("tone1Btn");
const tone2Btn = document.getElementById("tone2Btn");

function randomBaseFrequency() {
  return 220 + Math.random() * 440;
}

function intervalRatio(semitones) {
  return Math.pow(2, semitones / 12);
}

function generatePair() {
  const base = randomBaseFrequency();
  const ratio = intervalRatio(difficulty);

  if (Math.random() < 0.5) {
    freq1 = base;
    freq2 = base * ratio;
  } else {
    freq1 = base * ratio;
    freq2 = base;
  }
}

function playTone(freq, duration = 0.6) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = waveform;
  osc.frequency.value = freq;

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.start();
  osc.stop(now + duration);
}

function playPair() {
  playTone(freq1);
  setTimeout(() => playTone(freq2), 800);

  if (!played) {
    tone1Btn.disabled = false;
    tone2Btn.disabled = false;
    playBtn.innerText = "Erneut abspielen";
    played = true;
  }
}

function nextPair() {
  round++;

  if (round > TOTAL_ROUNDS) {
    finishGame();
    return;
  }

  answered = false;
  played = false;

  playBtn.innerText = "Abspielen";
  nextBtn.disabled = true;

  tone1Btn.disabled = true;
  tone2Btn.disabled = true;

  generatePair();
  updateUI();
}

function answer(firstHigher) {
  if (answered) {
    return;
  }

  answered = true;
  const correct = (freq1 > freq2 && firstHigher) || (freq2 > freq1 && !firstHigher);

  if (correct) {
    score++;
    correctHistory.push(true);
    document.getElementById("feedback").innerHTML = "✅ Super! (+1 Punkt)";
  } else {
    correctHistory.push(false);
    document.getElementById("feedback").innerHTML = "❌ Falsch - Höre nochmal!";
  }

  tone1Btn.disabled = true;
  tone2Btn.disabled = true;
  nextBtn.disabled = false;

  adaptDifficulty(correct);
  updateStats();
}

function adaptDifficulty(correct) {
  if (correct) {
    difficulty = Math.max(1, difficulty - 0.5);
  } else {
    difficulty = Math.min(12, difficulty + 0.5);
  }
}

function updateUI() {
  document.getElementById("roundLabel").innerText = "Tonpaar " + round + " / " + TOTAL_ROUNDS;
  document.getElementById("feedback").innerText = "";
  updateStats();
}

function updateStats() {
  const accuracy = correctHistory.length
    ? Math.round((correctHistory.filter((x) => x).length / correctHistory.length) * 100)
    : 0;

  document.getElementById("liveStats").innerHTML =
    "Punkte:&nbsp;" +
    score +
    "&emsp;Trefferquote:&nbsp;" +
    accuracy +
    "%" +
    "&emsp;Intervall:&nbsp;" +
    difficulty.toFixed(1) +
    "&nbsp;HT";
}

let animId,
  balloons = [];

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function launchBalloons() {
  balloons = [];
  if (animId) {
    cancelAnimationFrame(animId);
  }

  const W = document.body.offsetWidth;
  const COUNT = W / 100;

  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement("div");
    el.textContent = "🎈";
    el.style.cssText = `position:absolute;font-size:${rand(28, 48)}px;user-select:none;will-change:transform;display:none;filter: hue-rotate(${rand(0, 360)}deg)`;
    document.body.appendChild(el);
    balloons.push({
      el,
      x: rand(-W / 2 + 50, W / 2 - 50),
      y: document.body.offsetHeight - rand(0, 120),
      vy: rand(150, 300),
      sway: rand(15, 35),
      swaySpeed: rand(1.5, 2.8),
      swayOffset: rand(0, Math.PI * 2),
      delay: rand(0, 900),
    });
  }

  let start = null;

  function frame(ts) {
    if (!start) {
      start = ts;
    }
    const elapsed = (ts - start) / 1000;
    let anyAlive = false;

    for (const b of balloons) {
      const t = elapsed - b.delay / 1000;
      if (t < 0) {
        anyAlive = true;
        continue;
      }
      b.el.style.display = "inline";
      const y = b.y - b.vy * t;
      const x = b.x + Math.sin(t * b.swaySpeed + b.swayOffset) * b.sway;
      const opacity = t < 0.3 ? t / 0.3 : y < -60 ? 0 : 1;
      if (y < -100) {
        b.el.remove();
        continue;
      }
      anyAlive = true;
      b.el.style.transform = `translate(${x}px, ${y}px)`;
      b.el.style.opacity = opacity;
    }

    if (anyAlive) {
      animId = requestAnimationFrame(frame);
    }
  }

  animId = requestAnimationFrame(frame);
}

function finishGame() {
  document.getElementById("game").classList.add("hidden");
  document.getElementById("result").classList.remove("hidden");

  const accuracy = Math.round((score / TOTAL_ROUNDS) * 100);

  document.getElementById("finalScore").innerHTML = "Punkte: <b>" + score + " / " + TOTAL_ROUNDS + "</b>";
  document.getElementById("sessionStats").innerHTML = "Trefferquote: " + accuracy + "%";

  if (accuracy > 90) {
    launchBalloons();
  }
}

function startGame() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  difficulty = parseFloat(document.getElementById("difficulty").value);
  waveform = document.getElementById("waveform").value;

  document.getElementById("setup").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");

  nextPair();
}

function startOver() {
  document.getElementById("game").classList.add("hidden");
  document.getElementById("result").classList.add("hidden");
  document.getElementById("setup").classList.remove("hidden");
  round = 0;
  score = 0;
  correctHistory = [];
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}
