/**
 * background.js — Focus Timer service worker
 * Context: Runs as a background service worker, independent of any open tab or popup.
 * Responsibilities: countdown logic using chrome.alarms, send browser notifications,
 * persist timer state in chrome.storage.local so popup can read it at any time.
 */

const ALARM_NAME = 'focusTick'; // fires every second

// ── Listen for messages from popup.js ──
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.action) {
    case 'start':  startTimer();         break;
    case 'pause':  pauseTimer();         break;
    case 'reset':  resetTimer();         break;
    case 'setMode': switchMode(msg.mode); break;
  }
});

// ── Start: create a repeating 1-second alarm ──
function startTimer() {
  chrome.storage.local.get(
    ['secondsLeft', 'focusMinutes', 'mode'],
    (data) => {
      // If no time set yet, initialise from settings
      const focusMins = data.focusMinutes ?? 25;
      const seconds   = data.secondsLeft  ?? focusMins * 60;
      const total     = getTotalSeconds(data.mode ?? 'focus', data);

      chrome.storage.local.set({
        isRunning:    true,
        secondsLeft:  seconds,
        totalSeconds: total
      });

      // chrome.alarms minimum period is 1 minute in real use,
      // but in MV3 you can use 0 for every ~1 second during testing.
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 / 60 });
    }
  );
}

// ── Pause: clear the alarm but keep secondsLeft ──
function pauseTimer() {
  chrome.alarms.clear(ALARM_NAME);
  chrome.storage.local.set({ isRunning: false });
}

// ── Reset: clear alarm and restore default seconds ──
function resetTimer() {
  chrome.alarms.clear(ALARM_NAME);
  chrome.storage.local.get(['mode', 'focusMinutes', 'breakMinutes'], (data) => {
    const total = getTotalSeconds(data.mode ?? 'focus', data);
    chrome.storage.local.set({
      isRunning:    false,
      secondsLeft:  total,
      totalSeconds: total
    });
  });
}

// ── Switch focus/break mode ──
function switchMode(mode) {
  chrome.alarms.clear(ALARM_NAME);
  chrome.storage.local.get(['focusMinutes', 'breakMinutes'], (data) => {
    const total = getTotalSeconds(mode, data);
    chrome.storage.local.set({
      mode,
      isRunning:    false,
      secondsLeft:  total,
      totalSeconds: total
    });
  });
}

// ── Helper: get total seconds for a given mode ──
function getTotalSeconds(mode, data) {
  if (mode === 'break') {
    return (data.breakMinutes ?? 5) * 60;
  }
  return (data.focusMinutes ?? 25) * 60;
}

// ── Alarm tick: count down one second ──
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  chrome.storage.local.get(
    ['secondsLeft', 'mode', 'sessionsToday', 'focusMinutes', 'breakMinutes'],
    (data) => {
      let seconds = data.secondsLeft ?? 0;

      if (seconds <= 0) {
        // Timer finished — send notification and switch mode
        chrome.alarms.clear(ALARM_NAME);
        const currentMode = data.mode ?? 'focus';
        const nextMode    = currentMode === 'focus' ? 'break' : 'focus';

        // Increment session count when a focus session ends
        const sessions = currentMode === 'focus'
          ? (data.sessionsToday ?? 0) + 1
          : (data.sessionsToday ?? 0);

        sendNotification(currentMode);

        const total = getTotalSeconds(nextMode, data);
        chrome.storage.local.set({
          mode:          nextMode,
          secondsLeft:   total,
          totalSeconds:  total,
          isRunning:     false,
          sessionsToday: sessions
        });
        return;
      }

      // Normal tick: subtract 1 second
      chrome.storage.local.set({ secondsLeft: seconds - 1 });
    }
  );
});

// ── Send a browser notification ──
function sendNotification(finishedMode) {
  const isFocus = finishedMode === 'focus';
  chrome.notifications.create({
    type:    'basic',
    iconUrl: 'icons/icon48.png',
    title:   isFocus ? '🍅 Focus session complete!' : '☕ Break over!',
    message: isFocus
      ? 'Great work! Time for a short break.'
      : 'Break finished. Ready to focus again?'
  });
}

// ── On install: set default storage values ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    mode:          'focus',
    isRunning:     false,
    secondsLeft:   25 * 60,
    totalSeconds:  25 * 60,
    sessionsToday: 0,
    focusMinutes:  25,
    breakMinutes:  5
  });
});
