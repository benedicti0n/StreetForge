"use client";

const COLLISION_MIN_INTERVAL_MS = 140;
const SKID_THRESHOLD_SPEED_KMH = 12;

class VehicleAudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;

  private engineSource: AudioBufferSourceNode | null = null;
  private engineBuffer: AudioBuffer | null = null;
  private engineLoadState: "idle" | "loading" | "loaded" | "failed" = "idle";
  private engineGain: GainNode | null = null;

  private skidSource: AudioBufferSourceNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;

  private sirenOscA: OscillatorNode | null = null;
  private sirenOscB: OscillatorNode | null = null;
  private sirenLfo: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenLfoGain: GainNode | null = null;
  private sirenBuffer: AudioBuffer | null = null;
  private sirenSource: AudioBufferSourceNode | null = null;
  private sirenDistanceGain: GainNode | null = null;
  private sirenLoadState: "idle" | "loading" | "loaded" | "failed" = "idle";

  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private sirenActive = false;
  private lastCollisionAt = 0;

  get isUnlocked(): boolean {
    return this.context !== null;
  }

  /** Must be called from a user gesture (click/touch). */
  unlock(): void {
    if (this.context) {
      if (this.context.state === "suspended") {
        void this.context.resume();
      }
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) {
      return;
    }
    const context = new Ctor();
    this.context = context;
    const master = context.createGain();
    master.gain.value = this.muted ? 0 : 0.85;
    master.connect(context.destination);
    this.master = master;
    this.buildEngine();
    this.buildSkid();
    this.buildSiren();
    this.loadSirenBuffer();
    this.loadEngineBuffer();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : 0.85,
        this.context.currentTime,
        0.03,
      );
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setSirenActive(active: boolean, fadeSeconds = active ? 0.15 : 0.4): void {
    this.sirenActive = active;
    if (!this.context || !this.sirenGain) {
      return;
    }
    const time = this.context.currentTime;
    if (active) {
      if (this.sirenLoadState === "loaded" && this.sirenBuffer) {
        this.startSirenSource();
      } else {
        // Procedural fallback while the CC0 clip loads (or if it failed).
        if (this.sirenLoadState === "idle") {
          this.loadSirenBuffer();
        }
        this.sirenGain.gain.setTargetAtTime(0.075, time, fadeSeconds);
      }
      return;
    }
    this.sirenGain.gain.setTargetAtTime(0, time, fadeSeconds);
    if (this.sirenSource) {
      const source = this.sirenSource;
      const stopAt = time + fadeSeconds * 2 + 0.05;
      this.sirenSource = null;
      const delayMs = (stopAt - time) * 1000;
      window.setTimeout(() => {
        try {
          source.stop();
        } catch {
          // already stopped
        }
      }, delayMs);
    }
  }

  /** Scales the siren volume with the police distance (near = louder). */
  setSirenDistance(distanceMeters: number): void {
    const gain = this.sirenDistanceGain;
    if (!gain || !this.context) {
      return;
    }
    const factor = Math.min(1, Math.max(0.35, 1.2 - distanceMeters / 60));
    gain.gain.setTargetAtTime(factor, this.context.currentTime, 0.2);
  }

  private startSirenSource(): void {
    if (!this.context || !this.sirenBuffer || !this.sirenGain || this.sirenSource) {
      return;
    }
    const source = this.context.createBufferSource();
    source.buffer = this.sirenBuffer;
    source.loop = true;
    const distanceGain = this.context.createGain();
    distanceGain.gain.value = 0.8;
    source.connect(distanceGain).connect(this.sirenGain);
    source.start();
    this.sirenSource = source;
    this.sirenDistanceGain = distanceGain;
    const time = this.context.currentTime;
    this.sirenGain.gain.setTargetAtTime(0.075, time, 0.15);
  }

  private async loadSirenBuffer(): Promise<void> {
    if (this.sirenLoadState !== "idle" || !this.context) {
      return;
    }
    this.sirenLoadState = "loading";
    try {
      const response = await fetch("/audio/police-siren.ogg");
      if (!response.ok) {
        throw new Error(`siren fetch failed: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      this.sirenBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.sirenLoadState = "loaded";
      // Start immediately if the siren is already active.
      if (this.sirenActive) {
        this.startSirenSource();
      }
    } catch {
      this.sirenLoadState = "failed";
      this.sirenBuffer = null;
    }
  }

  get isSirenActive(): boolean {
    return this.sirenActive;
  }

  /** speedKmh and throttle (-1..1) drive the engine sample. */
  updateEngine(speedKmh: number, throttle: number): void {
    if (!this.context || !this.engineSource || !this.engineGain) {
      return;
    }
    const time = this.context.currentTime;
    const speedFactor = Math.min(Math.abs(speedKmh) / 165, 1);
    const throttleFactor = Math.max(0, throttle);
    // Idle / parked: near-silent. Driving: audible presence that grows with
    // speed and throttle. The clip loops; only gain/rate are animated.
    const targetGain =
      speedFactor < 0.01 && throttleFactor < 0.05
        ? 0.006
        : 0.055 + 0.05 * speedFactor + 0.045 * throttleFactor;
    this.engineGain.gain.setTargetAtTime(targetGain, time, 0.09);
    this.engineSource.playbackRate.setTargetAtTime(
      0.85 + 0.3 * speedFactor + 0.15 * throttleFactor,
      time,
      0.12,
    );
  }

  /** amount 0..1 drives the tire-skid noise. */
  setSkid(amount: number): void {
    if (!this.context || !this.skidGain) {
      return;
    }
    const time = this.context.currentTime;
    this.skidGain.gain.setTargetAtTime(
      Math.min(Math.max(amount, 0), 1) * 0.14,
      time,
      0.06,
    );
  }

  /** Impact-speed based collision thud, rate limited. */
  playCollision(impactSpeed: number): void {
    if (!this.context || !this.master) {
      return;
    }
    const now = performance.now();
    if (now - this.lastCollisionAt < COLLISION_MIN_INTERVAL_MS) {
      return;
    }
    this.lastCollisionAt = now;
    const intensity = Math.min(Math.max((impactSpeed - 1.5) / 12, 0), 1);
    if (intensity <= 0.02) {
      return;
    }
    const context = this.context;
    const time = context.currentTime;
    const thump = context.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(130, time);
    thump.frequency.exponentialRampToValueAtTime(45, time + 0.18);
    const thumpGain = context.createGain();
    thumpGain.gain.setValueAtTime(0.32 * intensity, time);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    thump.connect(thumpGain).connect(this.master);
    thump.start(time);
    thump.stop(time + 0.25);
  }

  dispose(): void {
    if (this.context) {
      void this.context.close();
      this.context = null;
      this.master = null;
      this.engineSource = null;
      this.engineBuffer = null;
      this.engineLoadState = "idle";
      this.engineGain = null;
      this.skidSource = this.skidFilter = this.skidGain = null;
      this.sirenOscA = this.sirenOscB = this.sirenLfo = this.sirenGain =
        this.sirenLfoGain = null;
      this.sirenSource = null;
      this.sirenDistanceGain = null;
      this.sirenBuffer = null;
      this.sirenLoadState = "idle";
      this.noiseBuffer = null;
    }
  }

  private buildEngine(): void {
    const context = this.context;
    if (!context) {
      return;
    }
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(this.master ?? context.destination);
    this.engineGain = gain;
  }

  private async loadEngineBuffer(): Promise<void> {
    if (this.engineLoadState !== "idle" || !this.context) {
      return;
    }
    this.engineLoadState = "loading";
    try {
      const response = await fetch("/audio/engine.mp3");
      if (!response.ok) {
        throw new Error(`engine fetch failed: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      this.engineBuffer = await this.context.decodeAudioData(arrayBuffer);
      const source = this.context.createBufferSource();
      source.buffer = this.engineBuffer;
      source.loop = true;
      const gain = this.engineGain;
      if (gain) {
        source.connect(gain);
        source.start();
        this.engineSource = source;
      }
      this.engineLoadState = "loaded";
    } catch {
      this.engineLoadState = "failed";
      this.engineSource = null;
      this.engineBuffer = null;
    }
  }

  private buildSkid(): void {
    const context = this.context;
    if (!context) {
      return;
    }
    const bufferSize = context.sampleRate * 1.2;
    const buffer = context.createBuffer(
      1,
      Math.floor(bufferSize),
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 720;
    filter.Q.value = 1.6;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.master ?? context.destination);
    source.start();
    this.skidSource = source;
    this.skidFilter = filter;
    this.skidGain = gain;
  }

  private buildSiren(): void {
    const context = this.context;
    if (!context) {
      return;
    }
    const gain = context.createGain();
    gain.gain.value = 0;
    const oscA = context.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.value = 720;
    const oscB = context.createOscillator();
    oscB.type = "sawtooth";
    oscB.frequency.value = 1440;
    const oscBGain = context.createGain();
    oscBGain.gain.value = 0.4;
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.9;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 110;
    lfo.connect(lfoGain).connect(oscA.frequency);
    lfo.connect(lfoGain).connect(oscB.frequency);
    oscA.connect(gain);
    oscB.connect(oscBGain).connect(gain);
    gain.connect(this.master ?? context.destination);
    oscA.start();
    oscB.start();
    lfo.start();
    this.sirenOscA = oscA;
    this.sirenOscB = oscB;
    this.sirenLfo = lfo;
    this.sirenGain = gain;
    this.sirenLfoGain = lfoGain;
  }
}

export const vehicleAudio = new VehicleAudioEngine();

export function computeSkidAmount(
  speedKmh: number,
  handbrake: number,
  lateralSlip: number,
): number {
  const speedFactor = Math.min(Math.max(speedKmh / 80, 0), 1);
  if (speedKmh < SKID_THRESHOLD_SPEED_KMH) {
    return 0;
  }
  const handbrakeSkid = handbrake * speedFactor * 0.85;
  const slipSkid = Math.min(Math.max((lateralSlip - 4) / 10, 0), 1) * 0.5;
  return Math.min(Math.max(handbrakeSkid + slipSkid, 0), 1);
}