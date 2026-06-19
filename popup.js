/**
 * popup.js — Focus Timer popup script
 * Context: Runs inside the popup window each time the user opens it.
 * Responsibilities: display timer state, send start/stop/reset commands
 * to the background service worker, and update chrome.storage settings.
 */

const CIRCUMFERENCE = 2 * Math.PI * 70; // radius = 70

// ── DOM references ──
const timerCenter   = document.getElementById('timer-center');
const ringFg        = document.getElementById('ring-fg');
const btnStart      = document.getElementById('btn-start');
const btnReset      = document.getElementById('btn-reset');
const btnSave       = document.getElementById('btn-save');
const tabFocus      = document.getElementById('tab-focus');
const tabBreak      = document.getElementById('tab-break');
const sessionCount  = document.getElementById('session-count');
const focusInput    = document.getElementById('focus-minutes');
const breakInput    = document.getElementById('break-minutes');

// ── Helpers ──
function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function updateRing(secondsLeft, totalSeconds) {
  const progress = secondsLeft / totalSeconds;
  const offset   = CIRCUMFERENCE * (1 - progress);
  ringFg.style.strokeDasharray  = CIRCUMFERENCE;
  ringFg.style.strokeDashoffset = offset;
}

function setActiveTab(mode) {
  tabFocus.classList.toggle('active', mode === 'focus');
  tabBreak.classList.toggle('active', mode === 'break');
  // change ring colour for break mode
  ringFg.style.stroke = mode === 'break' ? '#4ecca3' : '#e94560';
}

// ── Load state from storage and render ──
function loadState() {
  chrome.storage.local.get(
    ['secondsLeft', 'totalSeconds', 'isRunning', 'mode', 'sessionsToday',
     'focusMinutes', 'breakMinutes'],
    (data) => {
      const secondsLeft  = data.secondsLeft  ?? 25 * 60;
      const totalSeconds = data.totalSeconds ?? 25 * 60;
      const mode         = data.mode         ?? 'focus';
      const sessions     = data.sessionsToday ?? 0;
      const focusMins    = data.focusMinutes  ?? 25;
      const breakMins    = data.breakMinutes  ?? 5;

      timerCenter.textContent  = formatTime(secondsLeft);
      sessionCount.textContent = sessions;
      focusInput.value         = focusMins;
      breakInput.value         = breakMins;

      updateRing(secondsLeft, totalSeconds);
      setActiveTab(mode);

      btnStart.textContent = data.isRunning ? '⏸ Pause' : '▶ Start';
    }
  );
}

// Poll storage every second while popup is open to keep display live
let pollInterval = setInterval(loadState, 1000);
loadState(); // immediate first render

// ── Button: Start / Pause ──
btnStart.addEventListener('click', () => {
  chrome.storage.local.get(['isRunning'], (data) => {
    const nowRunning = !data.isRunning;
    // tell background to start or pause via storage flag
    chrome.storage.local.set({ isRunning: nowRunning });
    chrome.runtime.sendMessage({ action: nowRunning ? 'start' : 'pause' });
    btnStart.textContent = nowRunning ? '⏸ Pause' : '▶ Start';
  });
});

// ── Button: Reset ──
btnReset.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'reset' });
  setTimeout(loadState, 100); // let background process first
});

// ── Tabs: switch mode manually ──
tabFocus.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'setMode', mode: 'focus' });
  setTimeout(loadState, 100);
});

tabBreak.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'setMode', mode: 'break' });
  setTimeout(loadState, 100);
});

// ── Button: Save custom settings ──
btnSave.addEventListener('click', () => {
  const focusMins = parseInt(focusInput.value, 10) || 25;
  const breakMins = parseInt(breakInput.value, 10) || 5;
  chrome.storage.local.set({ focusMinutes: focusMins, breakMinutes: breakMins });
  chrome.runtime.sendMessage({ action: 'reset' }); // reset with new times
  setTimeout(loadState, 100);
  btnSave.textContent = '✓ Saved!';
  setTimeout(() => { btnSave.textContent = 'Save Settings'; }, 1500);
});

// Clean up polling when popup closes
window.addEventListener('unload', () => clearInterval(pollInterval));
