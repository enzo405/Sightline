# Sightline 🎹

**From playing by ear to reading and improvising fluently.**

Sightline is a piano-learning web app for the "self-taught plateau" pianist: strong ears and
hands, weak reading. It bridges what your hands already know to what's on the page through a
three-stage path — **Read → Play while reading → Improvise** — entirely in the browser, no
account, no backend.

> 🤖 This app was made and created with [Claude](https://claude.com/claude-code) (Anthropic).

## Features

1. **Play-to-Notation Mirror** — connect a digital piano over MIDI (or use the on-screen /
   computer keyboard), play something you know, and see it engraved instantly on a grand
   staff: rhythm quantization, chords, rests, ties. Then play it back.
2. **Adaptive Sight-Reading** — generated exercises with a live cursor: correct notes turn
   green, misses flash red, rhythm is graded against your own pulse. Difficulty (keys, range,
   rhythms, accidentals) self-adjusts to hold you near **85% accuracy**.
3. **Fading Score** — familiar pieces (Ode to Joy, Twinkle, Saints, Jingle Bells) start with
   note names + fingering; each pass at ≥90% fades a layer until whole bars go blank and the
   notes rematerialize only as you play them. Trains reading ahead.
4. **Improvisation Lab** — lead-sheet chord timelines with a synth backing track (blues, pop,
   ii–V–I, minor vamp). Chord tones and scale tones light up on the keyboard, your lines get
   live inside/outside stats, plus call-and-response drills and constraint cards
   ("only chord tones", "only 3 notes", "one octave").
5. **Progress skill map** — reading level, accuracy trend, accuracy by key signature, reading
   speed, streaks, fading stages. All measured from actual playing, stored locally.

## Run it

### With Docker

```bash
docker compose up
# open http://localhost:8080
```

Or directly: `docker run -p 8080:80 registry.luhcaran.fr/sightline:0.1.0`

### From source

```bash
npm install
npm run dev
# open http://localhost:5173
```

## Input options

- **MIDI piano** — plug in and play (Chrome or Edge). ⚠️ Web MIDI requires a *secure
  context*: `localhost` works out of the box; a deployed instance must be behind **HTTPS**.
- **On-screen keyboard** — click/tap the piano at the bottom.
- **Computer keyboard** — the `A S D F …` row plays C4–E5 (`W E T Y U` for the black keys).

## Stack

Vite + TypeScript, [VexFlow](https://www.vexflow.com/) for engraving, Web MIDI + Web Audio,
localStorage for progress. No server, no tracking.
