/* =========================================================
   core/audio.js — WebAudio-эффекты и тумблер звука
========================================================= */
// @ts-nocheck
"use strict";

import { state } from "./state.js";
import { saveSettings } from "./storage.js";
import { showToast } from "./utils.js";

/* ---------- Тумблер звука (публичный API) ---------- */
export function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  saveSettings();

  showToast(state.soundEnabled ? "Звук включён" : "Звук выключен");

  return state.soundEnabled;
}

/* ---------- Ленивая инициализация AudioContext ---------- */
export function getAudioContext() {
  if (!state.soundEnabled) return null;

  if (!state.audioContext) {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return null;

    state.audioContext = new AudioContextClass();
  }

  if (state.audioContext.state === "suspended") {
    state.audioContext.resume().catch(() => {});
  }

  return state.audioContext;
}

/* ---------- Тон ---------- */
export function playTone({
  frequency = 440,
  duration = 0.12,
  type = "square",
  volume = 0.045,
  delay = 0
} = {}) {
  if (!state.soundEnabled) return;

  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();

  const startTime = context.currentTime + delay;
  const endTime = startTime + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(startTime);
  oscillator.stop(endTime + 0.02);
}

/* ---------- Готовые эффекты ---------- */
export function playAuditClick() {
  playTone({
    frequency: 850,
    duration: 0.045,
    type: "square",
    volume: 0.025
  });
}

export function playTimerTick() {
  playTone({
    frequency: 880,
    duration: 0.055,
    type: "square",
    volume: 0.04
  });
}

export function playAlarm() {
  playTone({
    frequency: 260,
    duration: 0.18,
    type: "sawtooth",
    volume: 0.06
  });

  playTone({
    frequency: 180,
    duration: 0.18,
    type: "sawtooth",
    volume: 0.06,
    delay: 0.2
  });

  playTone({
    frequency: 260,
    duration: 0.18,
    type: "sawtooth",
    volume: 0.06,
    delay: 0.4
  });
}

export function playSuccess() {
  playTone({
    frequency: 523.25,
    duration: 0.1,
    type: "square",
    volume: 0.045
  });

  playTone({
    frequency: 783.99,
    duration: 0.18,
    type: "square",
    volume: 0.045,
    delay: 0.11
  });
}

export function playFailure() {
  playTone({
    frequency: 230,
    duration: 0.16,
    type: "sawtooth",
    volume: 0.055
  });

  playTone({
    frequency: 130,
    duration: 0.24,
    type: "sawtooth",
    volume: 0.055,
    delay: 0.17
  });
}
