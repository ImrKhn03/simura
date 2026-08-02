/**
 * The world's voice — fully procedural WebAudio, no assets:
 * wind that rises with weather, rain when it rains, birdsong by day,
 * crickets by night. Starts only on a user gesture (browser policy).
 */

export class SoundScape {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private chirpTimer: ReturnType<typeof setInterval> | null = null;
  private dayPhase = 0.3; // 0..1; night is roughly > 0.75
  private weather = 'clear';
  private calamity: string | null = null;
  enabled = false;

  toggle(): boolean {
    if (this.enabled) { this.stop(); return false; }
    this.start(); return true;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  start(): void {
    if (this.ctx) { void this.ctx.resume(); this.enabled = true; return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);
    const noise = this.noiseBuffer(ctx);

    // wind: looping noise through a slowly-wandering lowpass
    const windSrc = ctx.createBufferSource(); windSrc.buffer = noise; windSrc.loop = true;
    const windLp = ctx.createBiquadFilter(); windLp.type = 'lowpass'; windLp.frequency.value = 320; windLp.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.05;
    windSrc.connect(windLp).connect(this.windGain).connect(this.master);
    windSrc.start();
    const wander = ctx.createOscillator(); wander.frequency.value = 0.07;
    const wanderAmt = ctx.createGain(); wanderAmt.gain.value = 140;
    wander.connect(wanderAmt).connect(windLp.frequency); wander.start();

    // rain: brighter noise band, gated by weather
    const rainSrc = ctx.createBufferSource(); rainSrc.buffer = noise; rainSrc.loop = true;
    const rainHp = ctx.createBiquadFilter(); rainHp.type = 'highpass'; rainHp.frequency.value = 1400;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    rainSrc.connect(rainHp).connect(this.rainGain).connect(this.master);
    rainSrc.start();

    // life: birdsong by day, crickets by night — short synthesized chirps
    this.chirpTimer = setInterval(() => this.chirp(), 1400);
    this.enabled = true;
  }

  private chirp(): void {
    const ctx = this.ctx; if (!ctx || !this.master || !this.enabled) return;
    const night = this.dayPhase > 0.72 || this.dayPhase < 0.03;
    if (this.weather === 'storm') return; // storms silence the small voices
    if (Math.random() > (night ? 0.75 : 0.5)) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g).connect(this.master);
    if (night) {
      // cricket: fast trill around 4.2kHz
      osc.type = 'sine'; osc.frequency.value = 4200 + Math.random() * 300;
      const trill = ctx.createOscillator(); trill.frequency.value = 24;
      const trillAmt = ctx.createGain(); trillAmt.gain.value = 0.02;
      trill.connect(trillAmt).connect(g.gain); trill.start(t); trill.stop(t + 0.5);
      g.gain.setValueAtTime(0.018, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.start(t); osc.stop(t + 0.5);
    } else {
      // bird: 2-4 falling whistles
      osc.type = 'sine';
      const notes = 2 + Math.floor(Math.random() * 3);
      const f0 = 2200 + Math.random() * 1400;
      g.gain.value = 0;
      for (let i = 0; i < notes; i++) {
        const nt = t + i * 0.16;
        osc.frequency.setValueAtTime(f0 + Math.random() * 300, nt);
        osc.frequency.exponentialRampToValueAtTime(f0 * 0.75, nt + 0.12);
        g.gain.setValueAtTime(0.03, nt);
        g.gain.exponentialRampToValueAtTime(0.0005, nt + 0.14);
      }
      osc.start(t); osc.stop(t + notes * 0.16 + 0.2);
    }
  }

  /** called on every snapshot: weather and time of day steer the soundscape */
  setState(dayPhase: number, weather: string, calamity: string | null = null): void {
    this.dayPhase = dayPhase; this.weather = weather; this.calamity = calamity;
    if (!this.ctx || !this.windGain || !this.rainGain) return;
    const t = this.ctx.currentTime;
    const calamityWind = calamity === 'wildfire' ? .2 : calamity === 'coldsnap' ? .18 : calamity === 'drought' ? .15 : calamity === 'plague' ? .035 : 0;
    const windy = Math.max(calamityWind, weather === 'storm' ? 0.22 : weather === 'rain' ? 0.12 : weather === 'fog' ? 0.03 : 0.06);
    this.windGain.gain.linearRampToValueAtTime(windy, t + 2);
    const rainy = calamity === 'flood' ? .18 : weather === 'storm' ? 0.14 : weather === 'rain' ? 0.09 : weather === 'snow' ? 0.015 : 0;
    this.rainGain.gain.linearRampToValueAtTime(rainy, t + 2);
  }

  setPageVisible(visible: boolean): void {
    if (!this.ctx || !this.enabled) return;
    if (visible) void this.ctx.resume(); else void this.ctx.suspend();
  }

  stop(): void {
    this.enabled = false;
    if (this.chirpTimer) { clearInterval(this.chirpTimer); this.chirpTimer = null; }
    if (this.ctx) { void this.ctx.close(); this.ctx = null; this.master = null; this.windGain = null; this.rainGain = null; }
  }
}
