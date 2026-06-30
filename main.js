"use strict";

/**
 * Pitch interval ear-training game.
 *
 * The module is split into four independent pieces:
 *  - AudioEngine         plays tones via the Web Audio API
 *  - IntervalGenerator   produces random frequency pairs at a given difficulty
 *  - BalloonCelebration  DOM-based balloon animation to celebrate near perfect rounds
 *  - GameController      owns game state, wires up the DOM, and drives the round loop
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIG = Object.freeze({
  TOTAL_ROUNDS: 15,
  BASE_FREQ_MIN: 220,
  BASE_FREQ_MAX: 660, // 220 + 440
  TONE_DURATION_SEC: 0.6,
  TONE_GAP_MS: 800,
  DIFFICULTY_MIN_SEMITONES: 1,
  DIFFICULTY_MAX_SEMITONES: 12,
  DIFFICULTY_STEP_SEMITONES: 0.5,
  CELEBRATION_ACCURACY_THRESHOLD: 90,
  BALLOON_PX_PER_BALLOON: 100,
  BALLOON_SIZE_MIN_PX: 28,
  BALLOON_SIZE_MAX_PX: 48,
  BALLOON_RISE_SPEED_MIN: 150,
  BALLOON_RISE_SPEED_MAX: 300,
  BALLOON_SWAY_MIN_PX: 15,
  BALLOON_SWAY_MAX_PX: 35,
  BALLOON_SWAY_SPEED_MIN: 1.5,
  BALLOON_SWAY_SPEED_MAX: 2.8,
  BALLOON_MAX_START_DELAY_MS: 900,
  BALLOON_FADE_IN_SEC: 0.3,
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** @returns {number} a random float in [min, max) */
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Converts a semitone interval to a frequency ratio.
 * @param {number} semitones
 * @returns {number}
 */
function semitonesToRatio(semitones) {
  return Math.pow(2, semitones / 12);
}

// ---------------------------------------------------------------------------
// AudioEngine
// ---------------------------------------------------------------------------

class AudioEngine {
  /** @param {OscillatorType} waveform */
  constructor(waveform) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported in this browser.");
    }
    this.context = new AudioContextClass();
    this.waveform = waveform;
  }

  /**
   * Plays a single tone with a short attack/decay envelope.
   * @param {number} frequency
   * @param {number} [duration]
   */
  playTone(frequency, duration = CONFIG.TONE_DURATION_SEC) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();

    oscillator.type = this.waveform;
    oscillator.frequency.value = frequency;

    oscillator.connect(gain);
    gain.connect(this.context.destination);

    const now = this.context.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  /**
   * Plays two tones in sequence, separated by a fixed gap.
   * @param {number} firstFrequency
   * @param {number} secondFrequency
   * @param {() => void} [onComplete] called once both tones have been scheduled
   */
  playPair(firstFrequency, secondFrequency, onComplete) {
    this.playTone(firstFrequency);
    setTimeout(() => {
      this.playTone(secondFrequency);
      if (onComplete) {
        onComplete();
      }
    }, CONFIG.TONE_GAP_MS);
  }
}

// ---------------------------------------------------------------------------
// IntervalGenerator - produces frequency pairs and adapts difficulty
// ---------------------------------------------------------------------------

class IntervalGenerator {
  /** @param {number} initialDifficultySemitones */
  constructor(initialDifficultySemitones) {
    this.difficulty = initialDifficultySemitones;
  }

  /** @returns {{ first: number, second: number }} */
  generatePair() {
    const base = randomBetween(CONFIG.BASE_FREQ_MIN, CONFIG.BASE_FREQ_MAX);
    const ratio = semitonesToRatio(this.difficulty);
    const higherFirst = Math.random() < 0.5;

    return higherFirst ? { first: base * ratio, second: base } : { first: base, second: base * ratio };
  }

  /**
   * Tightens the interval after a correct answer, widens it after a wrong one,
   * clamped to the configured difficulty range.
   * @param {boolean} wasCorrect
   */
  adapt(wasCorrect) {
    const step = wasCorrect ? -CONFIG.DIFFICULTY_STEP_SEMITONES : CONFIG.DIFFICULTY_STEP_SEMITONES;
    const next = this.difficulty + step;
    this.difficulty = Math.min(CONFIG.DIFFICULTY_MAX_SEMITONES, Math.max(CONFIG.DIFFICULTY_MIN_SEMITONES, next));
  }
}

// ---------------------------------------------------------------------------
// BalloonCelebration - lightweight animation for a high-accuracy finish
// ---------------------------------------------------------------------------

class BalloonCelebration {
  constructor() {
    this.balloons = [];
    this.animationFrameId = null;
  }

  launch() {
    this.stop();

    const viewportWidth = document.body.offsetWidth;
    const viewportHeight = document.body.offsetHeight;
    const balloonCount = Math.max(1, Math.floor(viewportWidth / CONFIG.BALLOON_PX_PER_BALLOON));

    this.balloons = Array.from({ length: balloonCount }, () => this.createBalloon(viewportWidth, viewportHeight));

    let startTimestamp = null;
    const step = (timestamp) => {
      if (startTimestamp === null) {
        startTimestamp = timestamp;
      }
      const elapsedSec = (timestamp - startTimestamp) / 1000;
      const stillAnimating = this.advance(elapsedSec);

      if (stillAnimating) {
        this.animationFrameId = requestAnimationFrame(step);
      } else {
        this.animationFrameId = null;
      }
    };

    this.animationFrameId = requestAnimationFrame(step);
  }

  stop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    for (const balloon of this.balloons) {
      balloon.element.remove();
    }
    this.balloons = [];
  }

  /**
   * @param {number} viewportWidth
   * @param {number} viewportHeight
   */
  createBalloon(viewportWidth, viewportHeight) {
    const element = document.createElement("div");
    element.textContent = "🎈";
    element.style.cssText =
      `position:absolute;` +
      `font-size:${randomBetween(CONFIG.BALLOON_SIZE_MIN_PX, CONFIG.BALLOON_SIZE_MAX_PX)}px;` +
      `user-select:none;will-change:transform;display:none;` +
      `filter:hue-rotate(${randomBetween(0, 360)}deg)`;
    document.body.appendChild(element);

    return {
      element,
      x: randomBetween(-viewportWidth / 2 + 50, viewportWidth / 2 - 50),
      y: viewportHeight - randomBetween(0, 120),
      riseSpeed: randomBetween(CONFIG.BALLOON_RISE_SPEED_MIN, CONFIG.BALLOON_RISE_SPEED_MAX),
      sway: randomBetween(CONFIG.BALLOON_SWAY_MIN_PX, CONFIG.BALLOON_SWAY_MAX_PX),
      swaySpeed: randomBetween(CONFIG.BALLOON_SWAY_SPEED_MIN, CONFIG.BALLOON_SWAY_SPEED_MAX),
      swayOffset: randomBetween(0, Math.PI * 2),
      delaySec: randomBetween(0, CONFIG.BALLOON_MAX_START_DELAY_MS) / 1000,
    };
  }

  /**
   * Advances every balloon by one animation frame.
   * @param {number} elapsedSec time since the celebration started
   * @returns {boolean} true if at least one balloon is still on screen
   */
  advance(elapsedSec) {
    let anyAlive = false;

    for (const balloon of this.balloons) {
      const localTime = elapsedSec - balloon.delaySec;
      if (localTime < 0) {
        anyAlive = true;
        continue;
      }

      const y = balloon.y - balloon.riseSpeed * localTime;
      if (y < -100) {
        balloon.element.remove();
        continue;
      }

      anyAlive = true;
      balloon.element.style.display = "inline";

      const x = balloon.x + Math.sin(localTime * balloon.swaySpeed + balloon.swayOffset) * balloon.sway;
      const opacity = localTime < CONFIG.BALLOON_FADE_IN_SEC ? localTime / CONFIG.BALLOON_FADE_IN_SEC : 1;

      balloon.element.style.transform = `translate(${x}px, ${y}px)`;
      balloon.element.style.opacity = String(opacity);
    }

    return anyAlive;
  }
}

// ---------------------------------------------------------------------------
// GameController - owns state, DOM bindings, and the round loop
// ---------------------------------------------------------------------------

class GameController {
  constructor() {
    this.dom = this.queryDom();
    this.balloonCelebration = new BalloonCelebration();

    this.audioEngine = null;
    this.intervalGenerator = null;

    this.round = 0;
    this.score = 0;
    this.currentPair = { first: 0, second: 0 };
    this.hasAnswered = false;
    this.hasPlayedOnce = false;
    this.correctHistory = [];

    this.bindEvents();
  }

  /** Caches every DOM node the controller needs. @returns {Record<string, HTMLElement>} */
  queryDom() {
    const ids = [
      "setup",
      "game",
      "result",
      "difficulty",
      "waveform",
      "startBtn",
      "playBtn",
      "cancelBtn",
      "newGameBtn",
      "nextBtn",
      "tone1Btn",
      "tone2Btn",
      "roundLabel",
      "feedback",
      "liveStats",
      "finalScore",
      "sessionStats",
    ];

    const dom = {};
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) {
        dom[id] = element;
      }
    }
    return dom;
  }

  startGame() {
    const initialDifficulty = parseFloat(this.dom.difficulty.value);
    const waveform = this.dom.waveform.value;

    this.audioEngine = new AudioEngine(waveform);
    this.intervalGenerator = new IntervalGenerator(initialDifficulty);

    this.dom.setup.classList.add("hidden");
    this.dom.game.classList.remove("hidden");

    this.nextRound();
  }

  nextRound() {
    this.round++;

    if (this.round > CONFIG.TOTAL_ROUNDS) {
      this.finishGame();
      return;
    }

    this.hasAnswered = false;
    this.hasPlayedOnce = false;

    this.dom.playBtn.innerText = "Abspielen";
    this.dom.nextBtn.disabled = true;
    this.dom.tone1Btn.disabled = true;
    this.dom.tone2Btn.disabled = true;

    this.currentPair = this.intervalGenerator.generatePair();
    this.renderRoundHeader();
  }

  playCurrentPair() {
    this.audioEngine.playPair(this.currentPair.first, this.currentPair.second);

    if (!this.hasPlayedOnce) {
      this.dom.tone1Btn.disabled = false;
      this.dom.tone2Btn.disabled = false;
      this.dom.playBtn.innerText = "Erneut abspielen";
      this.hasPlayedOnce = true;
    }
  }

  /** @param {boolean} firstWasHigher whether the user judged the first tone as higher */
  submitAnswer(firstWasHigher) {
    if (this.hasAnswered) {
      return;
    }
    this.hasAnswered = true;

    const { first, second } = this.currentPair;
    const isCorrect = (first > second && firstWasHigher) || (second > first && !firstWasHigher);

    if (isCorrect) {
      this.score++;
    }
    this.correctHistory.push(isCorrect);
    this.dom.feedback.textContent = isCorrect ? "✅ Super! (+1 Punkt)" : "❌ Falsch - Höre nochmal!";

    this.dom.tone1Btn.disabled = true;
    this.dom.tone2Btn.disabled = true;
    this.dom.nextBtn.disabled = false;

    this.intervalGenerator.adapt(isCorrect);
    this.renderStats();
  }

  finishGame() {
    this.dom.game.classList.add("hidden");
    this.dom.result.classList.remove("hidden");

    const accuracy = this.computeAccuracy(this.score, CONFIG.TOTAL_ROUNDS);

    this.dom.finalScore.innerHTML = `Punkte: <b>${this.score} / ${CONFIG.TOTAL_ROUNDS}</b>`;
    this.dom.sessionStats.textContent = `Trefferquote: ${accuracy}%`;

    if (accuracy > CONFIG.CELEBRATION_ACCURACY_THRESHOLD) {
      this.balloonCelebration.launch();
    }
  }

  startOver() {
    const gameInProgress = this.correctHistory.length > 0 && this.round < CONFIG.TOTAL_ROUNDS;
    if (gameInProgress && !confirm("Neues Spiel starten?")) {
      return;
    }

    this.balloonCelebration.stop();

    this.dom.game.classList.add("hidden");
    this.dom.result.classList.add("hidden");
    this.dom.setup.classList.remove("hidden");

    this.round = 0;
    this.score = 0;
    this.correctHistory = [];
  }

  renderRoundHeader() {
    this.dom.roundLabel.textContent = `Tonpaar ${this.round} / ${CONFIG.TOTAL_ROUNDS}`;
    this.dom.feedback.textContent = "";
    this.renderStats();
  }

  renderStats() {
    const accuracy = this.computeAccuracy(this.correctHistory.filter(Boolean).length, this.correctHistory.length);

    this.dom.liveStats.innerHTML =
      `Punkte:&nbsp;${this.score}` +
      `&emsp;Trefferquote:&nbsp;${accuracy}%` +
      `&emsp;Intervall:&nbsp;${this.intervalGenerator.difficulty.toFixed(1)}&nbsp;HT`;
  }

  /**
   * @param {number} hits
   * @param {number} total
   * @returns {number} rounded percentage, 0 when total is 0
   */
  computeAccuracy(hits, total) {
    return total ? Math.round((hits / total) * 100) : 0;
  }

  bindEvents() {
    this.dom.startBtn?.addEventListener("click", () => this.startGame());
    this.dom.playBtn?.addEventListener("click", () => this.playCurrentPair());
    this.dom.nextBtn?.addEventListener("click", () => this.nextRound());
    this.dom.tone1Btn?.addEventListener("click", () => this.submitAnswer(true));
    this.dom.tone2Btn?.addEventListener("click", () => this.submitAnswer(false));
    this.dom.cancelBtn?.addEventListener("click", () => this.startOver());
    this.dom.newGameBtn?.addEventListener("click", () => this.startOver());
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  new GameController();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}
