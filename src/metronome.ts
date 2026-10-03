// Lookahead metronome on the audio clock.

import { click, now } from './synth';

export class Metronome {
  private timer: number | null = null;
  private nextBeatTime = 0;
  private beat = 0;
  running = false;

  start(bpm: number, beatsPerBar = 4, onBeat?: (beat: number) => void): void {
    this.stop();
    this.running = true;
    const interval = 60 / bpm;
    this.nextBeatTime = now() + 0.1;
    this.beat = 0;
    this.timer = window.setInterval(() => {
      while (this.nextBeatTime < now() + 0.15) {
        const b = this.beat;
        click(this.nextBeatTime, b % beatsPerBar === 0);
        if (onBeat) {
          const delay = Math.max(0, (this.nextBeatTime - now()) * 1000);
          window.setTimeout(() => this.running && onBeat(b), delay);
        }
        this.nextBeatTime += interval;
        this.beat++;
      }
    }, 40);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
  }
}
