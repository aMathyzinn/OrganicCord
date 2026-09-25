/**
 * Motor de som exclusivo do OrganicCord via Web Audio API procedural.
 * Proporciona identidade sonora única ao Organic, sem dependência de arquivos externos,
 * com latência zero e transições acústicas sem estalos (anti-pop).
 */

class SoundService {
  private ctx: AudioContext | null = null;
  private incomingLoopTimeout: number | null = null;
  private outgoingLoopTimeout: number | null = null;
  private incomingGainNode: GainNode | null = null;
  private outgoingGainNode: GainNode | null = null;
  private isIncomingRinging = false;
  private isOutgoingRinging = false;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  /**
   * Toca uma nota com harmônicos quentes e envelope percussivo suave (estilo marimba / sino orgânico).
   */
  private playOrganicTone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    volume: number,
    destination: AudioNode
  ) {
    const osc = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);

    harmonic.type = "triangle";
    harmonic.frequency.setValueAtTime(freq * 2, startTime);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq * 3, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 0.8, 100), startTime + duration);

    // Envelope ADSR suave (ataque rápido de 12ms, decaimento exponencial)
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(filter);
    harmonic.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    osc.start(startTime);
    harmonic.start(startTime);
    osc.stop(startTime + duration + 0.02);
    harmonic.stop(startTime + duration + 0.02);
  }

  // ==========================================
  // TOQUE DE CHAMADA RECEBIDA (INCOMING RING)
  // Identidade melódica acolhedora do Organic
  // ==========================================
  public playIncomingRing(): void {
    if (this.isIncomingRinging) return;
    this.isIncomingRinging = true;

    const runLoop = () => {
      if (!this.isIncomingRinging) return;
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      this.incomingGainNode = ctx.createGain();
      this.incomingGainNode.gain.setValueAtTime(0.35, now);
      this.incomingGainNode.connect(ctx.destination);

      // Frase musical melódica exclusiva do Organic (Fá maior / Lá menor contemporâneo):
      // Notas: C5 (523Hz), E5 (659Hz), G5 (784Hz), A5 (880Hz), seguido de resposta C6 (1046Hz) -> A5 (880Hz)
      const notes = [
        { f: 523.25, t: 0.0, d: 0.22, v: 0.28 },
        { f: 659.25, t: 0.14, d: 0.22, v: 0.32 },
        { f: 783.99, t: 0.28, d: 0.26, v: 0.35 },
        { f: 880.0, t: 0.44, d: 0.35, v: 0.38 },

        { f: 659.25, t: 0.85, d: 0.2, v: 0.25 },
        { f: 783.99, t: 0.98, d: 0.22, v: 0.3 },
        { f: 1046.5, t: 1.12, d: 0.45, v: 0.38 },
        { f: 880.0, t: 1.35, d: 0.55, v: 0.35 },
      ];

      for (const n of notes) {
        this.playOrganicTone(ctx, n.f, now + n.t, n.d, n.v, this.incomingGainNode);
      }

      // Intervalo entre ciclos do toque: 2.7 segundos
      this.incomingLoopTimeout = window.setTimeout(runLoop, 2700);
    };

    runLoop();
  }

  public stopIncomingRing(): void {
    this.isIncomingRinging = false;
    if (this.incomingLoopTimeout !== null) {
      clearTimeout(this.incomingLoopTimeout);
      this.incomingLoopTimeout = null;
    }
    if (this.incomingGainNode && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        this.incomingGainNode.gain.cancelScheduledValues(now);
        this.incomingGainNode.gain.setValueAtTime(this.incomingGainNode.gain.value, now);
        this.incomingGainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
        setTimeout(() => {
          this.incomingGainNode?.disconnect();
          this.incomingGainNode = null;
        }, 50);
      } catch {
        this.incomingGainNode = null;
      }
    }
  }

  // ==========================================
  // TOQUE DE CHAMADA EFETUADA (OUTGOING RING)
  // Arpeggio harmônico suave de expectativa
  // ==========================================
  public playOutgoingRing(): void {
    if (this.isOutgoingRinging) return;
    this.isOutgoingRinging = true;

    const runLoop = () => {
      if (!this.isOutgoingRinging) return;
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      this.outgoingGainNode = ctx.createGain();
      this.outgoingGainNode.gain.setValueAtTime(0.28, now);
      this.outgoingGainNode.connect(ctx.destination);

      // Duplo pulso harmônico espaçado
      const phrase = [
        { f: 440.0, t: 0.0, d: 0.35, v: 0.22 },
        { f: 554.37, t: 0.12, d: 0.45, v: 0.25 },
        { f: 659.25, t: 0.25, d: 0.65, v: 0.28 },

        { f: 440.0, t: 0.8, d: 0.35, v: 0.22 },
        { f: 554.37, t: 0.92, d: 0.45, v: 0.25 },
        { f: 659.25, t: 1.05, d: 0.75, v: 0.28 },
      ];

      for (const p of phrase) {
        this.playOrganicTone(ctx, p.f, now + p.t, p.d, p.v, this.outgoingGainNode);
      }

      this.outgoingLoopTimeout = window.setTimeout(runLoop, 3100);
    };

    runLoop();
  }

  public stopOutgoingRing(): void {
    this.isOutgoingRinging = false;
    if (this.outgoingLoopTimeout !== null) {
      clearTimeout(this.outgoingLoopTimeout);
      this.outgoingLoopTimeout = null;
    }
    if (this.outgoingGainNode && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        this.outgoingGainNode.gain.cancelScheduledValues(now);
        this.outgoingGainNode.gain.setValueAtTime(this.outgoingGainNode.gain.value, now);
        this.outgoingGainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
        setTimeout(() => {
          this.outgoingGainNode?.disconnect();
          this.outgoingGainNode = null;
        }, 50);
      } catch {
        this.outgoingGainNode = null;
      }
    }
  }

  // ==========================================
  // EFEITOS DE CONEXÃO (JOIN / LEAVE)
  // ==========================================
  public playUserJoined(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    // Tom ascendente brilhante (E5 -> B5)
    this.playOrganicTone(ctx, 659.25, now, 0.18, 0.26, gain);
    this.playOrganicTone(ctx, 987.77, now + 0.08, 0.35, 0.32, gain);
  }

  public playUserLeft(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    // Tom descendente aveludado (A4 -> D4)
    this.playOrganicTone(ctx, 440.0, now, 0.18, 0.26, gain);
    this.playOrganicTone(ctx, 293.66, now + 0.09, 0.32, 0.22, gain);
  }

  // ==========================================
  // EFEITOS DE MICROFONE (MUTE / UNMUTE)
  // ==========================================
  public playMute(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    // Clique descendente rápido e discreto
    this.playOrganicTone(ctx, 420.0, now, 0.07, 0.22, gain);
    this.playOrganicTone(ctx, 310.0, now + 0.035, 0.09, 0.24, gain);
  }

  public playUnmute(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    // Clique ascendente rápido e limpo
    this.playOrganicTone(ctx, 330.0, now, 0.07, 0.22, gain);
    this.playOrganicTone(ctx, 480.0, now + 0.035, 0.1, 0.26, gain);
  }

  // ==========================================
  // EFEITOS DE FONE / ENSURDECER (DEAFEN / UNDEAFEN)
  // ==========================================
  public playDeafen(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.14);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playUndeafen(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.14);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(1200, now + 0.14);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }
}

export const soundService = new SoundService();
