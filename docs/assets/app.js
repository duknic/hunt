/* The Hunt — client logic. No backend, no dependencies. */

const KEY = 'hunt.v1';

const store = {
  read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { solved: [], digits: {} }; }
    catch { return { solved: [], digits: {} }; }
  },
  write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} },
  solve(id, digit, value) {
    const s = this.read();
    if (!s.solved.includes(id)) s.solved.push(id);
    if (digit) s.digits[digit] = value;
    this.write(s);
    return s;
  },
  reset() { try { localStorage.removeItem(KEY); } catch {} }
};

const isDev = () => {
  if (new URLSearchParams(location.search).has('dev')) {
    try { sessionStorage.setItem('hunt.dev', '1'); } catch {}
  }
  try { return sessionStorage.getItem('hunt.dev') === '1'; } catch { return false; }
};

/* Forgiving comparison: case, spacing and punctuation are never the puzzle. */
const normalise = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function sha256(str) {
  const bytes = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- digit slots ---------- */

function paintSlots() {
  const row = document.querySelector('.slots');
  if (!row) return;
  const { digits } = store.read();
  row.querySelectorAll('.slot').forEach(el => {
    const n = el.dataset.slot;
    if (digits[n]) {
      el.textContent = digits[n];
      el.classList.add('filled');
      el.classList.remove('empty');
    } else {
      el.textContent = '';
      el.classList.add('empty');
      el.classList.remove('filled');
    }
  });
}

/* ---------- gate on each stage ---------- */

function guard(stage) {
  if (isDev() || !stage.requires) return true;
  const { solved } = store.read();
  if (solved.includes(stage.requires)) return true;

  document.querySelector('.stage').innerHTML = `
    <p class="eyebrow">Not yet</p>
    <h1>You've jumped ahead.</h1>
    <p class="clue"><p>This one opens later. Go back and pick up where you were.</p></p>
    <a href="${stage.home || '../../'}">Back to the start</a>`;
  return false;
}

/* ---------- answer form ---------- */

function wireForm(stage) {
  const form = document.querySelector('form');
  if (!form) return;
  const input = form.querySelector('input[type=text]');
  const msg = document.querySelector('.msg');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const given = normalise(input.value);
    if (!given) return;

    if (await sha256(given) !== stage.hash) {
      msg.className = 'msg wrong';
      msg.textContent = 'Not that. Try again, or message me.';
      input.select();
      return;
    }

    store.solve(stage.id, stage.digit, stage.digitValue);
    paintSlots();
    msg.className = 'msg right';
    msg.textContent = stage.after || 'Yes.';
    input.disabled = true;
    setTimeout(() => { location.href = stage.next; }, stage.after ? 2200 : 900);
  });
}

/* ---------- geolocation: warmer / colder ---------- */

function metresBetween(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad * Math.cos((a.lat + b.lat) / 2 * rad);
  return Math.sqrt(dLat * dLat + dLng * dLng) * R;
}

function wireGeo(stage) {
  const start = document.querySelector('#start');
  if (!start) return;

  const temp = document.querySelector('.temp');
  const readout = document.querySelector('.readout');
  const panel = document.querySelector('#tracker');
  const reveal = document.querySelector('#reveal');

  const HYSTERESIS = 15;   // metres of noise we refuse to react to
  let last = null;
  let audio = null;
  let unlocked = false;

  function beep(distance) {
    if (!audio) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 440 + Math.max(0, 400 - distance) * 1.6;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(audio.destination);
    osc.start(t); osc.stop(t + 0.13);
  }

  function onFix(pos) {
    const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const acc = Math.round(pos.coords.accuracy);
    const d = metresBetween(here, { lat: stage.lat, lng: stage.lng });

    readout.textContent = `accuracy ±${acc}m`;

    if (acc > 100) {
      temp.textContent = 'Hmm';
      temp.className = 'temp cold';
      readout.textContent = `accuracy ±${acc}m — that's too vague. Check Precise Location is on for Safari.`;
      return;
    }

    if (d <= stage.unlockRadius) {
      if (!unlocked) {
        unlocked = true;
        temp.textContent = 'Here';
        temp.className = 'temp warm';
        reveal.hidden = false;
        panel.hidden = true;
        beep(0); setTimeout(() => beep(0), 140); setTimeout(() => beep(0), 280);
      }
      return;
    }

    if (last === null) {
      temp.textContent = 'Walk';
      temp.className = 'temp cold';
    } else if (Math.abs(last - d) >= HYSTERESIS) {
      const closer = d < last;
      temp.textContent = closer ? 'Warmer' : 'Colder';
      temp.className = 'temp ' + (closer ? 'warm' : 'cold');
      if (closer) beep(d);
    }
    last = last === null ? d : (Math.abs(last - d) >= HYSTERESIS ? d : last);
  }

  function onFail(err) {
    panel.hidden = false;
    temp.textContent = 'No signal';
    temp.className = 'temp cold';
    readout.textContent = err.code === 1
      ? 'Location is switched off for this page. Reload and say yes, or just message me and I\u2019ll send you a photo of the spot.'
      : 'Your phone can\u2019t get a fix. Message me and I\u2019ll send you a photo of the spot.';
  }

  start.addEventListener('click', () => {
    // Both of these must be created inside the tap: iOS requires a user gesture.
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch {}
    start.hidden = true;
    panel.hidden = false;
    temp.textContent = 'Finding you';
    navigator.geolocation.watchPosition(onFix, onFail, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 20000
    });
  });
}

/* ---------- dev panel ---------- */

function wireDev(stage) {
  if (!isDev()) return;
  const box = document.createElement('div');
  box.className = 'dev';
  box.innerHTML = `<b>Test mode</b>
    answer: ${stage.plain ? stage.plain : '(none)'}<br>
    ${stage.digit ? `digit ${stage.digit} = ${stage.digitValue}<br>` : ''}
    ${stage.lat ? `target: ${stage.lat}, ${stage.lng}<br>` : ''}
    <button class="ghost" id="wipe" style="margin-top:.6rem">Clear all progress</button>`;
  document.querySelector('.stage').appendChild(box);
  box.querySelector('#wipe').addEventListener('click', () => {
    store.reset(); paintSlots();
    box.querySelector('#wipe').textContent = 'Cleared';
  });
}

/* ---------- boot ---------- */

window.addEventListener('DOMContentLoaded', () => {
  const stage = window.STAGE || {};
  isDev();
  paintSlots();
  if (!guard(stage)) return;
  wireForm(stage);
  wireGeo(stage);
  wireDev(stage);

  const trail = document.querySelector('#trail');
  if (trail) {
    const { solved } = store.read();
    trail.querySelectorAll('li').forEach(li => {
      const state = li.querySelector('.state');
      if (!state) return;
      const done = solved.includes(li.dataset.id);
      state.textContent = done ? 'done' : 'locked';
      state.className = 'state ' + (done ? 'done' : 'locked');
    });
  }
});
