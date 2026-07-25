export type GameSoundEffect =
  | "tap"
  | "select"
  | "splash"
  | "whistle"
  | "clue"
  | "reward"
  | "reveal"
  | "success"
  | "failure"
  | "start"
  | "deny";

export interface GameSoundEffects {
  unlock(): void;
  play(effect: GameSoundEffect): void;
  dispose(): void;
}

type ToneOptions = Readonly<{
  frequency: number;
  endFrequency?: number;
  duration: number;
  gain: number;
  offset?: number;
  type?: OscillatorType;
}>;

export function createGameSoundEffects(root: HTMLElement): GameSoundEffects {
  const soundToggle = requireSoundToggle(root);
  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let effectCount = 0;
  const recentEffects: GameSoundEffect[] = [];
  let lastSplashAt = Number.NEGATIVE_INFINITY;
  let enabled = readSoundEnabled();
  root.dataset.audioState = "locked";
  root.dataset.audioEffectCount = "0";
  syncSoundSetting();

  function unlock(): void {
    if (!context) {
      if (typeof AudioContext === "undefined") {
        root.dataset.audioState = "unsupported";
        return;
      }
      context = new AudioContext();
      masterGain = context.createGain();
      masterGain.gain.value = 0.22;
      masterGain.connect(context.destination);
      context.addEventListener("statechange", updateAudioState);
    }
    if (context.state === "suspended") void context.resume().then(updateAudioState);
    updateAudioState();
  }

  function updateAudioState(): void {
    root.dataset.audioState = context?.state ?? "locked";
  }

  function play(effect: GameSoundEffect): void {
    if (!enabled) return;
    unlock();
    if (!context || !masterGain || context.state === "closed") return;
    if (effect === "splash") {
      const now = performance.now();
      if (now - lastSplashAt < 140) return;
      lastSplashAt = now;
    }

    const start = context.currentTime + 0.012;
    if (effect === "tap") playTone(context, masterGain, start, { frequency: 460, endFrequency: 560, duration: 0.055, gain: 0.055 });
    if (effect === "select") playTone(context, masterGain, start, { frequency: 520, endFrequency: 690, duration: 0.1, gain: 0.09, type: "triangle" });
    if (effect === "deny") playTone(context, masterGain, start, { frequency: 190, endFrequency: 135, duration: 0.14, gain: 0.08, type: "triangle" });
    if (effect === "splash") playSplash(context, masterGain, start);
    if (effect === "whistle") playWhistle(context, masterGain, start);
    if (effect === "clue") playSequence(context, masterGain, start, [480, 640, 820], 0.075, 0.12);
    if (effect === "reward") playSequence(context, masterGain, start, [392, 523, 659], 0.09, 0.14);
    if (effect === "reveal") playSequence(context, masterGain, start, [330, 440, 660, 880], 0.08, 0.16);
    if (effect === "start") playSequence(context, masterGain, start, [392, 587, 784], 0.075, 0.18);
    if (effect === "success") playSequence(context, masterGain, start, [523, 659, 784, 1046], 0.085, 0.19);
    if (effect === "failure") playSequence(context, masterGain, start, [392, 330, 262], 0.085, 0.18, "triangle");

    effectCount += 1;
    recentEffects.push(effect);
    if (recentEffects.length > 8) recentEffects.shift();
    root.dataset.audioLastEffect = effect;
    root.dataset.audioEffectCount = String(effectCount);
    root.dataset.audioHistory = recentEffects.join(",");
  }

  const onPointerDown = (event: PointerEvent): void => {
    unlock();
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button || button.disabled || button.dataset.agentId) return;
    play(button.dataset.moveDirection ? "splash" : "tap");
  };
  const onKeyDown = (): void => unlock();
  const onSoundToggle = (): void => {
    if (!soundToggle.checked) play("tap");
    enabled = soundToggle.checked;
    try {
      localStorage.setItem("who-is-mom:sound-enabled", String(enabled));
    } catch {
      // The setting still applies for this session when storage is unavailable.
    }
    syncSoundSetting();
    if (enabled) play("tap");
  };

  function syncSoundSetting(): void {
    soundToggle.checked = enabled;
    root.dataset.audioEnabled = String(enabled);
  }

  root.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeyDown);
  soundToggle.addEventListener("change", onSoundToggle);

  return {
    unlock,
    play,
    dispose() {
      root.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      soundToggle.removeEventListener("change", onSoundToggle);
      if (context) {
        context.removeEventListener("statechange", updateAudioState);
        if (context.state !== "closed") void context.close();
      }
      delete root.dataset.audioState;
      delete root.dataset.audioLastEffect;
      delete root.dataset.audioEffectCount;
      delete root.dataset.audioHistory;
      delete root.dataset.audioEnabled;
    },
  };
}

function requireSoundToggle(root: HTMLElement): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>("[data-sound-enabled]");
  if (!input) throw new Error("Missing game sound setting.");
  return input;
}

function readSoundEnabled(): boolean {
  try {
    return localStorage.getItem("who-is-mom:sound-enabled") !== "false";
  } catch {
    return true;
  }
}

function playTone(context: AudioContext, output: AudioNode, start: number, options: ToneOptions): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const offset = options.offset ?? 0;
  const toneStart = start + offset;
  const toneEnd = toneStart + options.duration;

  oscillator.type = options.type ?? "sine";
  oscillator.frequency.setValueAtTime(options.frequency, toneStart);
  oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency ?? options.frequency, toneEnd);
  gain.gain.setValueAtTime(0.0001, toneStart);
  gain.gain.exponentialRampToValueAtTime(options.gain, toneStart + Math.min(0.018, options.duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(toneStart);
  oscillator.stop(toneEnd + 0.01);
}

function playSequence(
  context: AudioContext,
  output: AudioNode,
  start: number,
  frequencies: readonly number[],
  step: number,
  duration: number,
  type: OscillatorType = "sine",
): void {
  frequencies.forEach((frequency, index) => {
    playTone(context, output, start, {
      frequency,
      endFrequency: frequency * 1.015,
      duration,
      gain: 0.075,
      offset: index * step,
      type,
    });
  });
}

function playSplash(context: AudioContext, output: AudioNode, start: number): void {
  playTone(context, output, start, {
    frequency: 210,
    endFrequency: 105,
    duration: 0.16,
    gain: 0.07,
    type: "sine",
  });

  const frameCount = Math.floor(context.sampleRate * 0.12);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length);
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = 780;
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(0.045, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  source.start(start);
}

function playWhistle(context: AudioContext, output: AudioNode, start: number): void {
  playTone(context, output, start, {
    frequency: 860,
    endFrequency: 1320,
    duration: 0.38,
    gain: 0.075,
    type: "sine",
  });
  playTone(context, output, start, {
    frequency: 1120,
    endFrequency: 1680,
    duration: 0.34,
    gain: 0.035,
    offset: 0.035,
    type: "sine",
  });
}
