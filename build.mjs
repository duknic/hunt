/* Build the hunt. Reads stages.json, writes docs/. Run: node build.mjs */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import QRCode from 'qrcode';

const root = new URL('.', import.meta.url).pathname;
const out = join(root, 'docs');
const cfg = JSON.parse(readFileSync(join(root, 'stages.json'), 'utf8'));
const base = cfg.site.baseUrl.replace(/\/$/, '');

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const sha = s => createHash('sha256').update(norm(s)).digest('hex');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'assets'), { recursive: true });
cpSync(join(root, 'src', 'style.css'), join(out, 'assets', 'style.css'));
cpSync(join(root, 'src', 'app.js'), join(out, 'assets', 'app.js'));

/* ---------- shared chrome ---------- */

const slots = `<div class="slots"><span class="slots-label">The code</span>
  <div class="slot empty" data-slot="1"></div>
  <div class="slot empty" data-slot="2"></div>
  <div class="slot empty" data-slot="3"></div>
</div>`;

function page({ title, body, stage = {}, depth = 1 }) {
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${up}assets/style.css">
</head>
<body>
<main class="wrap">
${slots}
<div class="stage">
${body}
</div>
</main>
<script>window.STAGE = ${JSON.stringify(stage)};</script>
<script src="${up}assets/app.js"></script>
</body>
</html>`;
}

const clueHtml = lines => `<div class="clue">${lines.map(l => `<p>${esc(l)}</p>`).join('\n')}</div>`;

/* ---------- stage pages ---------- */

const stages = cfg.stages;
// Relative, so the same build works on Pages and on a local server.
const nextFromStage = i => i >= stages.length ? '../../done/' : `../${stages[i].id}/`;
const absFor = id => `${base}/s/${id}/`;

stages.forEach((s, i) => {
  const isScan = !!s.qr;
  const isGeo = s.type === 'geo';

  let body = `<p class="eyebrow">${esc(s.label)}</p>\n<h1>${esc(s.title)}</h1>\n${clueHtml(s.clue)}`;

  if (s.barcode) {
    body += `<p class="barcode">${esc(s.barcode).split('').join(' ')} <span class="missing">?</span></p>`;
  }
  if (s.cipher) {
    body += `<p class="triples">${s.cipher.map(t => t.join(' &middot; ')).join('<br>')}</p>`;
  }
  if (s.words) {
    body += `<ul class="words">${s.words.map(w =>
      `<li><b>${esc(w.word)}</b><span>${esc(w.pairedWith)}</span></li>`).join('')}</ul>`;
  }
  if (s.note) body += `<p class="note">${esc(s.note)}</p>`;

  if (isGeo) {
    body += `<button id="start">Start hunting</button>
<div id="tracker" hidden>
  <p class="temp cold">&nbsp;</p>
  <p class="readout"></p>
</div>
<div id="reveal" hidden>
  <p class="clue"><p>${esc(s.reveal || '')}</p></p>
  <form>
    <label for="a">${esc(s.inputLabel || 'Answer')}</label>
    <input type="text" id="a" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${esc(s.placeholder || '')}">
    <button type="submit">Check</button>
    <p class="msg"></p>
  </form>
</div>`;
  } else if (isScan) {
    body += `<p class="note">You found it. That counts.</p>
<form><button type="submit">Keep going</button><p class="msg"></p></form>`;
  } else {
    body += `<form>
  <label for="a">${esc(s.inputLabel || 'Answer')}</label>
  <input type="text" id="a" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${esc(s.placeholder || '')}">
  <button type="submit">Check</button>
  <p class="msg"></p>
</form>`;
  }

  const answer = isScan ? s.id : s.answer;
  const digitValue = s.digit
    ? (s.digitValue !== undefined
        ? String(s.digitValue)
        : s.digitFrom === 'last' ? String(s.answer).slice(-1) : String(s.answer))
    : undefined;

  const backTo = i > 0 ? `../${stages[i - 1].id}/` : '../../';
  body += `<nav class="nav">
  <a class="back" href="${backTo}">&larr; Back</a>
  <a class="all" href="../../">All ten</a>
  <a class="fwd" href="${nextFromStage(i + 1)}" hidden>Forward &rarr;</a>
</nav>`;

  const stageData = {
    id: s.id,
    base,
    home: '../../',
    hash: sha(answer),
    plain: isScan ? '(scan — press the button)' : s.answer,
    next: nextFromStage(i + 1),
    requires: i > 0 ? stages[i - 1].id : null,
    after: s.after || null,
    digit: s.digit || null,
    digitValue,
    ...(isGeo ? { lat: s.lat, lng: s.lng, unlockRadius: s.unlockRadius || 40 } : {})
  };

  // Scan pages solve on button press with a fixed token, so the form still works.
  if (isScan) stageData.hash = sha(s.id);

  mkdirSync(join(out, 's', s.id), { recursive: true });
  writeFileSync(join(out, 's', s.id, 'index.html'),
    page({ title: `${s.label} — ${s.title}`, body, stage: stageData, depth: 2 }));
});

/* Scan pages: prefill the hidden answer so the button alone submits. */
stages.filter(s => s.qr).forEach(s => {
  const p = join(out, 's', s.id, 'index.html');
  let html = readFileSync(p, 'utf8');
  html = html.replace('<form><button type="submit">',
    `<form><input type="text" id="a" value="${s.id}" hidden><button type="submit">`);
  writeFileSync(p, html);
});

/* ---------- front page ---------- */

const trail = `<ul class="trail" id="trail">${stages.map(s =>
  `<li data-id="${s.id}"><span class="n">${esc(s.label)}</span><a href="s/${s.id}/">${esc(s.title)}</a><span class="state locked" style="margin-left:auto"></span></li>`
).join('')}</ul>`;

writeFileSync(join(out, 'index.html'), page({
  title: cfg.site.title,
  depth: 0,
  stage: {
    id: 'gate',
    base,
    home: './',
    hash: sha(cfg.gate.answer),
    plain: cfg.gate.answer,
    order: stages.map(st => ({ id: st.id, url: `s/${st.id}/` })),
    next: 's/' + stages[0].id + '/',
    requires: null
  },
  body: `<p class="eyebrow">For Jasmine</p>
<h1>${esc(cfg.site.title)}</h1>
<div class="clue"><p>Ten of them. Three of them give you a digit. You won't know which until they do.</p></div>
<h2>Before you start</h2>
<ul class="brief">${cfg.briefing.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
<form>
  <label for="a">${esc(cfg.gate.prompt)}</label>
  <input type="text" id="a" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${esc(cfg.gate.placeholder || '')}">
  <button type="submit">Begin</button>
  <p class="msg"></p>
</form>
<h2>Where you've got to</h2>
${trail}`
}));

/* ---------- finale ---------- */

mkdirSync(join(out, 'done'), { recursive: true });
writeFileSync(join(out, 'done', 'index.html'), page({
  title: 'Done',
  depth: 2,
  stage: { id: 'done', base, home: '../', requires: stages[stages.length - 1].id },
  body: `<p class="eyebrow">Ten of ten</p>
<h1>${esc(cfg.finale.heading)}</h1>
<div class="clue"><p>${esc(cfg.finale.body)}</p></div>
<p class="barcode">They should add up to <span class="missing">${cfg.site.checksum}</span></p>
<div class="clue"><p>${esc(cfg.finale.where)}</p></div>`
}));

/* ---------- location check page ---------- */

mkdirSync(join(out, 'check'), { recursive: true });
writeFileSync(join(out, 'check', 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Location check</title>
<link rel="stylesheet" href="../assets/style.css"></head>
<body><main class="wrap">
<p class="eyebrow">Diagnostic</p>
<h1>Location check</h1>
<div class="clue"><p>Tap the button. If accuracy comes back under about 20 metres, the hunt will work.</p></div>
<button id="go">Check my location</button>
<p class="temp cold" id="acc">&nbsp;</p>
<p class="readout" id="out"></p>
<p class="note">Accuracy over 1000m means Precise Location is off: Settings &rarr; Privacy &amp; Security &rarr; Location Services &rarr; Safari Websites.</p>
<script>
document.getElementById('go').addEventListener('click', function () {
  var acc = document.getElementById('acc'), out = document.getElementById('out');
  acc.textContent = 'Waiting';
  navigator.geolocation.watchPosition(function (p) {
    acc.textContent = '\u00b1' + Math.round(p.coords.accuracy) + 'm';
    acc.className = 'temp ' + (p.coords.accuracy <= 20 ? 'warm' : 'cold');
    out.textContent = p.coords.latitude.toFixed(5) + ', ' + p.coords.longitude.toFixed(5);
  }, function (e) {
    acc.textContent = 'Failed';
    out.textContent = 'code ' + e.code + ' — ' + e.message;
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
});
</script>
</main></body></html>`);

/* ---------- 404 ---------- */

writeFileSync(join(out, '404.html'), page({
  title: 'Nothing here',
  depth: 0,
  body: `<p class="eyebrow">404</p>
<h1>Nothing here.</h1>
<div class="clue"><p>Which is itself a kind of answer, but not a useful one.</p>
<p><a href="./">Back to the start</a></p></div>`
}));

/* ---------- QR codes + print sheets ---------- */

mkdirSync(join(out, 'print'), { recursive: true });

for (const j of cfg.jigsaws) {
  const target = absFor(j.id);
  const png = join(out, 'print', `qr-${j.id}.png`);
  await QRCode.toFile(png, target, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 1800,
    color: { dark: '#17242e', light: '#ffffff' }
  });

  // Fronts: the QR sliced into a 3x3 grid.
  const cells = n => Array.from({ length: 9 }, (_, k) => n(k)).join('');
  const front = cells(k => {
    const r = Math.floor(k / 3), c = k % 3;
    return `<div class="cell"><div class="qr" style="background-position:${c * 50}% ${r * 50}%"></div></div>`;
  });

  // Backs: columns reversed per row, so a long-edge duplex flip lines up.
  const back = cells(k => {
    const r = Math.floor(k / 3), c = 2 - (k % 3);
    return `<div class="cell"><span>${esc(j.backs[r * 3 + c])}</span></div>`;
  });

  writeFileSync(join(out, 'print', `${j.id}.html`), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Print — ${j.id}</title>
<style>
@page { size: A4; margin: 12mm; }
body { font-family: 'Space Grotesk', system-ui, sans-serif; margin: 0; }
.sheet { width: 180mm; height: 180mm; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); page-break-after: always; }
.cell { border: 0.3mm dashed #999; display: grid; place-items: center; overflow: hidden; position: relative; }
.qr { width: 100%; height: 100%; background-image: url('qr-${j.id}.png'); background-size: 300% 300%; }
.cell span { font-size: 34pt; text-align: center; padding: 6mm; }
h1 { font-size: 10pt; font-weight: 400; color: #666; margin: 0 0 4mm; }
@media print { h1 { display: none; } }
</style></head><body>
<h1>${j.id} — front (QR). Print double-sided, flip on long edge. Cut on the dashed lines and trim the outer margin.</h1>
<div class="sheet">${front}</div>
<h1>${j.id} — back</h1>
<div class="sheet">${back}</div>
</body></html>`);
}

/* ---------- report ---------- */

console.log(`Built ${stages.length} stages into docs/\n`);
console.log('Answers as configured:');
stages.forEach(s => console.log(`  ${s.label.padEnd(6)} ${s.id.padEnd(9)} ${s.qr ? '(scan)' : s.answer}${s.digit ? `   -> digit ${s.digit}` : ''}`));
const sum = stages.filter(s => s.digit).map(s =>
  s.digitValue !== undefined ? String(s.digitValue)
  : s.digitFrom === 'last' ? String(s.answer).slice(-1) : String(s.answer));
const total = sum.reduce((a, b) => a + (Number(b) || 0), 0);
console.log(`\nDigits: ${sum.join(' ')}  — they add up to ${total}, stages.json says the checksum is ${cfg.site.checksum}${total === cfg.site.checksum ? ' (match)' : ' (MISMATCH — fix one of them)'}`);
console.log(`\nQR targets:`);
cfg.jigsaws.forEach(j => console.log(`  ${j.id} -> ${base}/s/${j.id}/`));
console.log(`\nCheck for leftovers:`);
const raw = readFileSync(join(root, 'stages.json'), 'utf8');
const left = [...raw.matchAll(/CHANGEME\w*/g)].map(m => m[0]);
console.log(left.length ? `  ${left.length} placeholders still to fill: ${[...new Set(left)].join(', ')}` : '  none — you are ready');
