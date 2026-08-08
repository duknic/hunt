# The Hunt

A static treasure hunt. No backend, no database, no accounts. You edit one JSON file, run one command, push to GitHub Pages.

Everything ships with **working sample answers**, so you can walk the whole thing end to end before you've decided on a single real clue.

---

## Run it locally

```bash
npm install
node build.mjs
npx serve docs      # or: cd docs && python3 -m http.server 8000
```

Open `http://localhost:8000`. The gate answer is `sample`.

**Add `?dev=1` to any URL** and every page shows you its own answer, the target coordinates, and a button to wipe her progress. It survives across pages for the rest of the browser session, so you only type it once. Use this constantly while testing.

## Put it online

1. New GitHub repo. Push this folder.
2. Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder **`/docs`**.
3. Set `site.baseUrl` in `stages.json` to the URL Pages gives you, then `node build.mjs` again and push. This only affects the QR codes — everything else navigates relatively.

**Make the repo private if your plan allows.** Not because she'll go looking, but because a public repo puts every answer in a browsable file tree, and the answers aren't encrypted.

---

## Editing the hunt

Everything is in `stages.json`. After any change, run `node build.mjs` — it prints every answer back at you, checks the three digits add up to your checksum, and flags any `CHANGEME` you forgot.

### Going back over finished steps

A solved step stays open. Revisit it and the answer she gave is filled back in, read-only, with a **Forward** link to carry on — she never has to remember or retype anything. The footer of every step has **Back**, **All ten**, and (once solved) **Forward**. On the front page, the finished steps in the list become links, and the button reads *Pick up where I was* and jumps to the first step she hasn't done.

Steps she hasn't reached still show the "not yet" page rather than a spoiler.

**Answer matching is deliberately forgiving.** Case, spaces and punctuation are stripped before comparison, so `Sample`, `sample` and `the sample` all... no — `the sample` won't match, but `SAMPLE ` and `Sample` will. Spelling is never the puzzle.

### Stage types

| Field | What it does |
|---|---|
| `answer` | What she types. Omit for scan stages. |
| `digit` | `1`, `2` or `3` — this stage fills that slot in the code. |
| `digitFrom: "last"` | Use only the last character of the answer as the digit. |
| `digitValue` | Set the digit explicitly, ignoring the answer. |
| `type: "geo"` | Warmer/colder page. Needs `lat`, `lng`, `unlockRadius`. |
| `qr: true` | No typing — she gets here by scanning, and arriving counts as solving. |
| `after` | A line shown for a moment after she's right, before the next page. |
| `barcode`, `cipher`, `words`, `note` | Optional blocks rendered above the answer box. |

Each stage checks she's solved the one before it. If she jumps ahead — bookmark, back button, scanning a QR too early — she gets a "not yet" page instead of a spoiler.

---

## Printing the jigsaws

`node build.mjs` writes two print sheets to `docs/print/`:

- **`maths.html`** — the QR sliced into a 3×3 grid, with the expressions on the reverse
- **`photo.html`** — same, numbered 1–9 for the photo version

Open them in a browser and print. **Two pages each: front, then back.** Tell Officeworks double-sided, **flip on long edge** — the back sheet is already column-reversed to match that.

For the photo version, put your photo behind the numbers yourself, or just print the numbers and glue the photo on.

Before Thursday: print at home, cut, reassemble, and scan it with a phone. Ten minutes that de-risks the centrepiece.

## Checking her phone

`/check/` is a standalone diagnostic — one button, prints raw latitude, longitude and accuracy. Nothing about the hunt on it, so it's safe to load on her phone or a display iPhone in a shop.

**You want accuracy under about 20.** Over 1000 means Precise Location is off for Safari, which is a Settings fix on her phone, not something you can fix in code.

---

## Things that will bite you

**The minus sign.** Melbourne latitude is negative. `37.814` instead of `-37.814` puts your target in rural China.

**Testing geolocation from your desk.** You'll always read "colder" because you aren't moving. Set `lat`/`lng` temporarily to somewhere a few hundred metres away and walk around the block, or trust the logic and test it properly on the day's route.

**Progress lives in localStorage.** If she uses private browsing, or clears it, she starts again. Worth one line on the day: don't open it in a private tab.

**Have a fallback for every physical step.** Photograph both hiding spots, keep the intact spare jigsaw in your pocket, keep your phone charged. You are the hint system now.
