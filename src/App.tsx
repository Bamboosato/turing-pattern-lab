import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SimulationCanvas } from './components/SimulationCanvas';
import { patternPresets, defaultPreset } from './presets/presets';
import {
  createUserPreset,
  getDefaultUserPresetName,
  isUserPresetId,
  loadUserPresets,
  saveUserPresets,
  type UserPreset,
} from './presets/userPresets';
import { FEED_RANGE, KILL_RANGE, generateRandomParams, withFeedKill } from './simulation/random';
import {
  AUDIO_NOISE_SENSITIVITY_RANGE,
  createAudioNoiseSample,
  type AudioNoiseSample,
} from './simulation/audioNoise';
import {
  getFullscreenSimulationSize,
  getScaledSimulationSize,
  NORMAL_SIMULATION_SIZE,
  SIMULATION_SCALE_RANGE,
  type SimulationSize,
} from './simulation/size';
import {
  MOTION_SENSITIVITY_RANGE,
  type MotionShakeSample,
} from './simulation/motionShake';
import {
  DEFAULT_PATTERN_PALETTE,
  isDefaultPatternPalette,
  normalizeHexColor,
  type PatternPalette,
} from './simulation/palette';
import { SEED_MODE_OPTIONS, isSeedMode } from './simulation/seedModes';
import type { ReactionDiffusionParams, SeedMode } from './simulation/types';

const APP_CANVAS_VIEW_QUERY = '(max-width: 820px), (pointer: coarse)';
const FINE_TUNE_STEP = 0.0001;

type MotionShakeStatus = 'unavailable' | 'idle' | 'active' | 'denied';
type AudioNoiseStatus = 'unavailable' | 'ready' | 'active' | 'stopped' | 'blocked';

type DeviceMotionEventWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

type AudioContextConstructor = typeof AudioContext;
type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };

type AudioNoiseSession = {
  audioContext: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
  frequencyData: Uint8Array<ArrayBuffer>;
  animationFrame: number;
};

const MOTION_SHAKE_STATUS_LABEL: Record<MotionShakeStatus, string> = {
  unavailable: 'Unavailable',
  idle: 'Off',
  active: 'On',
  denied: 'Blocked',
};

const AUDIO_NOISE_STATUS_LABEL: Record<AudioNoiseStatus, string> = {
  unavailable: 'Unavailable',
  ready: 'Ready',
  active: 'Active',
  stopped: 'Stopped',
  blocked: 'Blocked',
};

function shouldUseAppCanvasView() {
  return window.matchMedia(APP_CANVAS_VIEW_QUERY).matches;
}

function getPresentationViewportSize(canvas: HTMLCanvasElement | null): SimulationSize {
  const rect = canvas?.getBoundingClientRect();

  if (rect && rect.width > 0 && rect.height > 0) {
    return {
      width: rect.width,
      height: rect.height,
    };
  }

  const visualViewport = window.visualViewport;

  return {
    width: visualViewport?.width ?? window.innerWidth,
    height: visualViewport?.height ?? window.innerHeight,
  };
}

function getDeviceMotionEventConstructor() {
  if (typeof window.DeviceMotionEvent === 'undefined') {
    return null;
  }

  return window.DeviceMotionEvent as DeviceMotionEventWithPermission;
}

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window.AudioContext !== 'undefined') {
    return window.AudioContext;
  }

  const webkitAudioContext = (window as WindowWithWebkitAudioContext).webkitAudioContext;

  return typeof webkitAudioContext === 'undefined' ? null : webkitAudioContext;
}

function supportsAudioNoise() {
  return (
    getAudioContextConstructor() !== null &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

function getMotionEventSample(event: DeviceMotionEvent): MotionShakeSample | null {
  const acceleration = event.acceleration;
  const accelerationIncludingGravity = event.accelerationIncludingGravity;
  const rotationRate = event.rotationRate;
  const x =
    acceleration?.x ??
    accelerationIncludingGravity?.x ??
    (typeof rotationRate?.gamma === 'number' ? rotationRate.gamma / 45 : undefined);
  const y =
    acceleration?.y ??
    accelerationIncludingGravity?.y ??
    (typeof rotationRate?.beta === 'number' ? rotationRate.beta / 45 : undefined);

  if (x === null && y === null) {
    return null;
  }

  if (typeof x === 'undefined' && typeof y === 'undefined') {
    return null;
  }

  return { x, y };
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const motionSampleRef = useRef<MotionShakeSample | null>(null);
  const audioSampleRef = useRef<AudioNoiseSample | null>(null);
  const audioSessionRef = useRef<AudioNoiseSession | null>(null);
  const isAudioStartingRef = useRef(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(defaultPreset.id);
  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => loadUserPresets());
  const [params, setParams] = useState<ReactionDiffusionParams>(defaultPreset.params);
  const [seedMode, setSeedMode] = useState<SeedMode>(defaultPreset.seedMode);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCanvasView, setIsCanvasView] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [baseSimulationSize, setBaseSimulationSize] =
    useState<SimulationSize>(NORMAL_SIMULATION_SIZE);
  const [scalePercent, setScalePercent] = useState(100);
  const [patternPalette, setPatternPalette] =
    useState<PatternPalette>(DEFAULT_PATTERN_PALETTE);
  const [resetKey, setResetKey] = useState(0);
  const [motionShakeStatus, setMotionShakeStatus] =
    useState<MotionShakeStatus>('unavailable');
  const [isMotionControlVisible, setIsMotionControlVisible] = useState(false);
  const [motionSensitivityPercent, setMotionSensitivityPercent] = useState(100);
  const [audioNoiseStatus, setAudioNoiseStatus] =
    useState<AudioNoiseStatus>('unavailable');
  const [isAudioControlVisible, setIsAudioControlVisible] = useState(false);
  const [audioSensitivityPercent, setAudioSensitivityPercent] = useState(100);

  const selectablePresets = useMemo(
    () => [...patternPresets, ...userPresets],
    [userPresets],
  );

  const selectedPreset = useMemo(
    () => selectablePresets.find((preset) => preset.id === selectedPresetId),
    [selectablePresets, selectedPresetId],
  );

  const selectedUserPreset = useMemo(
    () => userPresets.find((preset) => preset.id === selectedPresetId),
    [selectedPresetId, userPresets],
  );

  const simulationSize = useMemo(
    () => getScaledSimulationSize(baseSimulationSize, scalePercent),
    [baseSimulationSize, scalePercent],
  );

  const stopAudioSession = useCallback(() => {
    const session = audioSessionRef.current;

    if (!session) {
      audioSampleRef.current = null;
      return;
    }

    window.cancelAnimationFrame(session.animationFrame);
    session.source.disconnect();
    session.analyser.disconnect();
    session.stream.getTracks().forEach((track) => track.stop());
    void session.audioContext.close().catch(() => {
      // The browser may already have closed the context during page lifecycle changes.
    });
    audioSessionRef.current = null;
    audioSampleRef.current = null;
  }, []);

  const stopAudioNoise = useCallback(
    (nextStatus: AudioNoiseStatus = 'stopped') => {
      stopAudioSession();
      setAudioNoiseStatus(nextStatus);
    },
    [stopAudioSession],
  );

  const startAudioNoiseSampling = useCallback((session: AudioNoiseSession) => {
    const sampleRate = session.audioContext.sampleRate;
    const fftSize = session.analyser.fftSize;

    const readSample = () => {
      if (audioSessionRef.current !== session) {
        return;
      }

      session.analyser.getByteFrequencyData(session.frequencyData);
      audioSampleRef.current = createAudioNoiseSample(
        session.frequencyData,
        sampleRate,
        fftSize,
      );
      session.animationFrame = window.requestAnimationFrame(readSample);
    };

    readSample();
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      const canvas = canvasRef.current;
      const canvasIsFullscreen = Boolean(canvas && document.fullscreenElement === canvas);
      const shouldUseViewportSize = canvasIsFullscreen || isCanvasView;
      const viewportSize = shouldUseViewportSize
        ? getPresentationViewportSize(canvas)
        : NORMAL_SIMULATION_SIZE;
      const nextBaseSimulationSize = shouldUseViewportSize
        ? getFullscreenSimulationSize(viewportSize.width, viewportSize.height)
        : NORMAL_SIMULATION_SIZE;

      setIsFullscreen(canvasIsFullscreen);
      setCanFullscreen(Boolean(canvas));
      setBaseSimulationSize((current) =>
        current.width === nextBaseSimulationSize.width &&
        current.height === nextBaseSimulationSize.height
          ? current
        : nextBaseSimulationSize,
      );
    };

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncFullscreenState);

    if (canvasRef.current) {
      resizeObserver?.observe(canvasRef.current);
    }

    syncFullscreenState();
    const animationFrame = window.requestAnimationFrame(syncFullscreenState);

    document.addEventListener('fullscreenchange', syncFullscreenState);
    window.addEventListener('resize', syncFullscreenState);
    window.visualViewport?.addEventListener('resize', syncFullscreenState);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      window.removeEventListener('resize', syncFullscreenState);
      window.visualViewport?.removeEventListener('resize', syncFullscreenState);
    };
  }, [isCanvasView]);

  useEffect(() => {
    document.body.classList.toggle('canvas-view-active', isCanvasView);

    return () => {
      document.body.classList.remove('canvas-view-active');
    };
  }, [isCanvasView]);

  useEffect(() => {
    if (!isCanvasView) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCanvasView(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCanvasView]);

  useEffect(() => {
    saveUserPresets(userPresets);
  }, [userPresets]);

  useEffect(() => {
    const motionMedia = window.matchMedia(APP_CANVAS_VIEW_QUERY);

    const syncMotionAvailability = () => {
      const isVisible = motionMedia.matches;
      const supportsMotion = getDeviceMotionEventConstructor() !== null;

      setIsMotionControlVisible(isVisible);
      setMotionShakeStatus((current) => {
        if (!isVisible || !supportsMotion) {
          return 'unavailable';
        }

        if (current === 'active' || current === 'denied') {
          return current;
        }

        return 'idle';
      });
    };

    syncMotionAvailability();

    if (typeof motionMedia.addEventListener === 'function') {
      motionMedia.addEventListener('change', syncMotionAvailability);

      return () => {
        motionMedia.removeEventListener('change', syncMotionAvailability);
      };
    }

    motionMedia.addListener(syncMotionAvailability);

    return () => {
      motionMedia.removeListener(syncMotionAvailability);
    };
  }, []);

  useEffect(() => {
    const audioMedia = window.matchMedia(APP_CANVAS_VIEW_QUERY);

    const syncAudioAvailability = () => {
      const isVisible = audioMedia.matches;
      const supportsAudio = supportsAudioNoise();

      setIsAudioControlVisible(isVisible);

      if (!isVisible || !supportsAudio) {
        stopAudioSession();
        setAudioNoiseStatus('unavailable');
        return;
      }

      setAudioNoiseStatus((current) => {
        if (current === 'active' || current === 'blocked' || current === 'stopped') {
          return current;
        }

        return 'ready';
      });
    };

    syncAudioAvailability();

    if (typeof audioMedia.addEventListener === 'function') {
      audioMedia.addEventListener('change', syncAudioAvailability);

      return () => {
        audioMedia.removeEventListener('change', syncAudioAvailability);
      };
    }

    audioMedia.addListener(syncAudioAvailability);

    return () => {
      audioMedia.removeListener(syncAudioAvailability);
    };
  }, [stopAudioSession]);

  useEffect(() => {
    const stopForBackground = () => {
      if (audioSessionRef.current) {
        stopAudioNoise('stopped');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopForBackground();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', stopForBackground);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', stopForBackground);
    };
  }, [stopAudioNoise]);

  useEffect(() => {
    return () => {
      stopAudioSession();
    };
  }, [stopAudioSession]);

  useEffect(() => {
    if (motionShakeStatus !== 'active') {
      motionSampleRef.current = null;
      return;
    }

    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      const sample = getMotionEventSample(event);

      if (sample) {
        motionSampleRef.current = sample;
      }
    };

    window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });

    return () => {
      window.removeEventListener('devicemotion', handleDeviceMotion);
      motionSampleRef.current = null;
    };
  }, [motionShakeStatus]);

  const resetSimulation = (nextParams: ReactionDiffusionParams, nextSeedMode: SeedMode) => {
    setParams(nextParams);
    setSeedMode(nextSeedMode);
    setResetKey((current) => current + 1);
  };

  const handlePresetChange = (presetId: string) => {
    const preset = selectablePresets.find((candidate) => candidate.id === presetId);

    if (!preset) {
      setSelectedPresetId(null);
      return;
    }

    setSelectedPresetId(preset.id);
    resetSimulation(preset.params, preset.seedMode);

    const savedUserPreset = userPresets.find((userPreset) => userPreset.id === preset.id);
    const savedPalette = savedUserPreset?.palette;

    if (savedPalette) {
      setPatternPalette(savedPalette);
    }

    if (typeof savedUserPreset?.scalePercent === 'number') {
      setScalePercent(savedUserPreset.scalePercent);
    }
  };

  const handleSeedModeChange = (value: string) => {
    if (!isSeedMode(value)) {
      return;
    }

    setSelectedPresetId(null);
    resetSimulation(params, value);
  };

  const handleFeedChange = (feed: number) => {
    setParams((current) => withFeedKill(current, feed, current.kill));
    setSelectedPresetId(null);
  };

  const handleFeedAdjust = (delta: number) => {
    setParams((current) => withFeedKill(current, current.feed + delta, current.kill));
    setSelectedPresetId(null);
  };

  const handleKillChange = (kill: number) => {
    setParams((current) => withFeedKill(current, current.feed, kill));
    setSelectedPresetId(null);
  };

  const handleKillAdjust = (delta: number) => {
    setParams((current) => withFeedKill(current, current.feed, current.kill + delta));
    setSelectedPresetId(null);
  };

  const handleScaleChange = (scale: number) => {
    setScalePercent(scale);
  };

  const handlePaletteChange = (key: keyof PatternPalette, color: string) => {
    const normalizedColor = normalizeHexColor(color);

    if (!normalizedColor) {
      return;
    }

    setPatternPalette((current) => ({
      ...current,
      [key]: normalizedColor,
    }));
  };

  const handlePaletteReset = () => {
    setPatternPalette(DEFAULT_PATTERN_PALETTE);
  };

  const handleMotionShakeToggle = async () => {
    if (motionShakeStatus === 'active') {
      setMotionShakeStatus('idle');
      return;
    }

    if (!isMotionControlVisible) {
      return;
    }

    const deviceMotionEvent = getDeviceMotionEventConstructor();

    if (!deviceMotionEvent) {
      setMotionShakeStatus('unavailable');
      return;
    }

    if (typeof deviceMotionEvent.requestPermission === 'function') {
      try {
        const permission = await deviceMotionEvent.requestPermission();

        if (permission !== 'granted') {
          setMotionShakeStatus('denied');
          return;
        }
      } catch {
        setMotionShakeStatus('denied');
        return;
      }
    }

    setMotionShakeStatus('active');
  };

  const handleMotionSensitivityChange = (sensitivityPercent: number) => {
    setMotionSensitivityPercent(sensitivityPercent);
  };

  const handleAudioNoiseToggle = async () => {
    if (audioNoiseStatus === 'active') {
      stopAudioNoise('stopped');
      return;
    }

    if (isAudioStartingRef.current) {
      return;
    }

    if (!isAudioControlVisible) {
      return;
    }

    const AudioContextConstructor = getAudioContextConstructor();

    if (!AudioContextConstructor || !navigator.mediaDevices?.getUserMedia) {
      setAudioNoiseStatus('unavailable');
      return;
    }

    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;

    try {
      isAudioStartingRef.current = true;
      stopAudioSession();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContextConstructor();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      if (document.hidden) {
        source.disconnect();
        analyser.disconnect();
        stream.getTracks().forEach((track) => track.stop());
        void audioContext.close();
        setAudioNoiseStatus('stopped');
        return;
      }

      const session: AudioNoiseSession = {
        audioContext,
        analyser,
        source,
        stream,
        frequencyData: new Uint8Array(analyser.frequencyBinCount),
        animationFrame: 0,
      };

      audioSessionRef.current = session;
      startAudioNoiseSampling(session);
      setAudioNoiseStatus('active');
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      void audioContext?.close().catch(() => {
        // Ignore cleanup failures after a denied or interrupted permission request.
      });
      audioSampleRef.current = null;
      audioSessionRef.current = null;
      setAudioNoiseStatus('blocked');
    } finally {
      isAudioStartingRef.current = false;
    }
  };

  const handleAudioSensitivityChange = (sensitivityPercent: number) => {
    setAudioSensitivityPercent(sensitivityPercent);
  };

  const handleRandomize = () => {
    const randomPattern = generateRandomParams();
    setSelectedPresetId(null);
    resetSimulation(randomPattern.params, randomPattern.seedMode);
  };

  const handleRestart = () => {
    resetSimulation(params, seedMode);
  };

  const handleSavePreset = () => {
    const defaultName = selectedPreset
      ? `${selectedPreset.name} Custom`
      : getDefaultUserPresetName(userPresets.length);
    const requestedName = window.prompt('Preset name', defaultName);

    if (requestedName === null) {
      return;
    }

    const userPreset = createUserPreset({
      name: requestedName || defaultName,
      params,
      seedMode,
      palette: patternPalette,
      scalePercent,
    });

    setUserPresets((current) => [...current, userPreset]);
    setSelectedPresetId(userPreset.id);
  };

  const handleDeletePreset = () => {
    if (!selectedUserPreset) {
      return;
    }

    const shouldDelete = window.confirm(`Delete "${selectedUserPreset.name}"?`);

    if (!shouldDelete) {
      return;
    }

    setUserPresets((current) =>
      current.filter((preset) => preset.id !== selectedUserPreset.id),
    );
    setSelectedPresetId(null);
  };

  const handleSavePng = () => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'turing-pattern.png';
    link.click();
  };

  const handleExitPresentationView = async () => {
    const canvas = canvasRef.current;

    if (document.fullscreenElement === canvas && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        setIsFullscreen(false);
      }
    }

    setIsCanvasView(false);
  };

  const handleFullscreen = async () => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    if (document.fullscreenElement === canvas || isCanvasView) {
      await handleExitPresentationView();
      return;
    }

    if (shouldUseAppCanvasView() || !canvas.requestFullscreen) {
      setIsCanvasView(true);
      return;
    }

    try {
      await canvas.requestFullscreen();
    } catch {
      setIsCanvasView(true);
    }
  };

  const isPresentationView = isFullscreen || isCanvasView;
  const isMotionShakeActive = motionShakeStatus === 'active';
  const isAudioNoiseActive = audioNoiseStatus === 'active';
  const isDefaultPalette = isDefaultPatternPalette(patternPalette);

  return (
    <main className={isCanvasView ? 'app-shell app-shell--canvas-view' : 'app-shell'}>
      <section className="intro-section" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Reaction-diffusion canvas lab</p>
          <h1 id="page-title">Turing Pattern Lab</h1>
        </div>
        <p className="intro-copy">
          Explore how two virtual chemicals diffuse and react to form stripes, spots, cells,
          coral-like growth, and maze structures.
        </p>
      </section>

      <section className="workspace" aria-label="Interactive Turing pattern simulator">
        <div className={isCanvasView ? 'canvas-stage canvas-stage--immersive' : 'canvas-stage'}>
          <SimulationCanvas
            canvasRef={canvasRef}
            params={params}
            isPaused={isPaused}
            resetKey={resetKey}
            scalePercent={scalePercent}
            seedMode={seedMode}
            simulationSize={simulationSize}
            isAudioNoiseActive={isAudioNoiseActive}
            audioSampleRef={audioSampleRef}
            audioSensitivityPercent={audioSensitivityPercent}
            isMotionShakeActive={isMotionShakeActive}
            motionSampleRef={motionSampleRef}
            motionSensitivityPercent={motionSensitivityPercent}
            palette={patternPalette}
          />
          {isCanvasView && (
            <button
              type="button"
              className="canvas-view-exit"
              onClick={handleExitPresentationView}
            >
              Exit
            </button>
          )}
        </div>

        <aside className="control-panel" aria-label="Simulation controls">
          <div className="preset-control-actions" aria-label="Preset quick actions">
            <button type="button" onClick={handleRandomize}>
              Random
            </button>
            <button type="button" onClick={handleRestart}>
              Restart
            </button>
          </div>

          <label className="field">
            <span>Preset</span>
            <select
              value={selectedPresetId ?? ''}
              onChange={(event) => handlePresetChange(event.target.value)}
              aria-label="Pattern preset"
            >
              <option value="" disabled hidden>
                Current settings
              </option>
              <optgroup label="Built-in">
                {patternPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </optgroup>
              {userPresets.length > 0 && (
                <optgroup label="Saved">
                  {userPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <p className="preset-description">
            {selectedPreset?.description ??
              'Current settings are not saved as a preset yet.'}
          </p>

          <div className="preset-actions">
            <button type="button" onClick={handleSavePreset}>
              Save Preset
            </button>
            {selectedPresetId && isUserPresetId(selectedPresetId) && (
              <button
                type="button"
                className="danger-action"
                onClick={handleDeletePreset}
                disabled={!selectedUserPreset}
              >
                Delete Preset
              </button>
            )}
          </div>

          <label className="field range-field">
            <span>
              Feed <strong>{params.feed.toFixed(4)}</strong>
            </span>
            <input
              type="range"
              min="0.012"
              max="0.07"
              step="0.0001"
              value={params.feed}
              onChange={(event) => handleFeedChange(Number(event.target.value))}
              aria-label="Feed rate"
            />
            <div className="fine-tune-controls" aria-label="Feed fine tuning">
              <button
                type="button"
                onClick={() => handleFeedAdjust(-FINE_TUNE_STEP)}
                disabled={params.feed <= FEED_RANGE.min}
                aria-label="Decrease feed by 0.0001"
              >
                -
              </button>
              <span className="fine-tune-step" aria-hidden="true">
                0.0001
              </span>
              <button
                type="button"
                onClick={() => handleFeedAdjust(FINE_TUNE_STEP)}
                disabled={params.feed >= FEED_RANGE.max}
                aria-label="Increase feed by 0.0001"
              >
                +
              </button>
            </div>
          </label>

          <label className="field range-field">
            <span>
              Kill <strong>{params.kill.toFixed(4)}</strong>
            </span>
            <input
              type="range"
              min="0.045"
              max="0.072"
              step="0.0001"
              value={params.kill}
              onChange={(event) => handleKillChange(Number(event.target.value))}
              aria-label="Kill rate"
            />
            <div className="fine-tune-controls" aria-label="Kill fine tuning">
              <button
                type="button"
                onClick={() => handleKillAdjust(-FINE_TUNE_STEP)}
                disabled={params.kill <= KILL_RANGE.min}
                aria-label="Decrease kill by 0.0001"
              >
                -
              </button>
              <span className="fine-tune-step" aria-hidden="true">
                0.0001
              </span>
              <button
                type="button"
                onClick={() => handleKillAdjust(FINE_TUNE_STEP)}
                disabled={params.kill >= KILL_RANGE.max}
                aria-label="Increase kill by 0.0001"
              >
                +
              </button>
            </div>
          </label>

          <label className="field range-field">
            <span>
              Scale <strong>{scalePercent}%</strong>
            </span>
            <input
              type="range"
              min={SIMULATION_SCALE_RANGE.min}
              max={SIMULATION_SCALE_RANGE.max}
              step={SIMULATION_SCALE_RANGE.step}
              value={scalePercent}
              onChange={(event) => handleScaleChange(Number(event.target.value))}
              aria-label="Simulation resolution scale"
            />
            <span className="scale-detail" aria-live="polite">
              {simulationSize.width} x {simulationSize.height}px
            </span>
          </label>

          <label className="field">
            <span>Seed</span>
            <select
              value={seedMode}
              onChange={(event) => handleSeedModeChange(event.target.value)}
              aria-label="Initial seed pattern"
            >
              {SEED_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="palette-control" aria-label="Pattern colors">
            <label className="color-field">
              <span>
                Background <strong>{patternPalette.background.toUpperCase()}</strong>
              </span>
              <input
                type="color"
                value={patternPalette.background}
                onChange={(event) => handlePaletteChange('background', event.target.value)}
                onInput={(event) =>
                  handlePaletteChange('background', event.currentTarget.value)
                }
                aria-label="Background color"
              />
            </label>
            <label className="color-field">
              <span>
                Material <strong>{patternPalette.material.toUpperCase()}</strong>
              </span>
              <input
                type="color"
                value={patternPalette.material}
                onChange={(event) => handlePaletteChange('material', event.target.value)}
                onInput={(event) => handlePaletteChange('material', event.currentTarget.value)}
                aria-label="Material color"
              />
            </label>
            <button type="button" onClick={handlePaletteReset} disabled={isDefaultPalette}>
              Reset Colors
            </button>
          </div>

          {isMotionControlVisible && (
            <div className="motion-control" aria-label="Phone motion pattern disturbance">
              <span className="motion-control__label">
                Phone motion{' '}
                <strong aria-live="polite">
                  {MOTION_SHAKE_STATUS_LABEL[motionShakeStatus]}
                </strong>
              </span>
              <button
                type="button"
                onClick={handleMotionShakeToggle}
                disabled={motionShakeStatus === 'unavailable'}
                aria-pressed={isMotionShakeActive}
                aria-label={
                  isMotionShakeActive
                    ? 'Disable phone motion pattern disturbance'
                    : 'Enable phone motion pattern disturbance'
                }
              >
                {isMotionShakeActive ? 'Stop Shake' : 'Enable Shake'}
              </button>
              <label className="motion-sensitivity">
                <span>
                  Sensitivity <strong>{motionSensitivityPercent}%</strong>
                </span>
                <input
                  type="range"
                  min={MOTION_SENSITIVITY_RANGE.min}
                  max={MOTION_SENSITIVITY_RANGE.max}
                  step={MOTION_SENSITIVITY_RANGE.step}
                  value={motionSensitivityPercent}
                  onChange={(event) =>
                    handleMotionSensitivityChange(Number(event.target.value))
                  }
                  aria-label="Phone motion sensitivity"
                />
              </label>
            </div>
          )}

          {isAudioControlVisible && (
            <div className="motion-control" aria-label="Audio noise pattern disturbance">
              <span className="motion-control__label">
                Audio noise{' '}
                <strong aria-live="polite">
                  {AUDIO_NOISE_STATUS_LABEL[audioNoiseStatus]}
                </strong>
              </span>
              <button
                type="button"
                onClick={handleAudioNoiseToggle}
                disabled={audioNoiseStatus === 'unavailable'}
                aria-pressed={isAudioNoiseActive}
                aria-label={
                  isAudioNoiseActive
                    ? 'Disable audio noise pattern disturbance'
                    : 'Enable audio noise pattern disturbance'
                }
              >
                {isAudioNoiseActive ? 'Stop Audio' : 'Enable Audio'}
              </button>
              <label className="motion-sensitivity">
                <span>
                  Sensitivity <strong>{audioSensitivityPercent}%</strong>
                </span>
                <input
                  type="range"
                  min={AUDIO_NOISE_SENSITIVITY_RANGE.min}
                  max={AUDIO_NOISE_SENSITIVITY_RANGE.max}
                  step={AUDIO_NOISE_SENSITIVITY_RANGE.step}
                  value={audioSensitivityPercent}
                  onChange={(event) =>
                    handleAudioSensitivityChange(Number(event.target.value))
                  }
                  aria-label="Audio noise sensitivity"
                />
              </label>
            </div>
          )}

          <div className="button-row">
            <button type="button" onClick={() => setIsPaused((current) => !current)}>
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={handleFullscreen}
              disabled={!canFullscreen}
              aria-pressed={isPresentationView}
            >
              {isPresentationView ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
            <button type="button" className="primary-action" onClick={handleSavePng}>
              Save PNG
            </button>
          </div>
        </aside>
      </section>

      <section className="education-section" aria-labelledby="education-title">
        <h2 id="education-title">How the pattern appears</h2>
        <p>
          A Turing pattern can emerge when nearby reactions amplify small differences while
          diffusion spreads them through space. The Gray-Scott model used here simulates two
          chemicals, A and B, competing across a grid. Changing Feed and Kill shifts the balance,
          so the same rules can become spots, stripes, branching forms, or maze-like paths.
        </p>
      </section>

      {!isPresentationView && (
        <footer className="app-footer" aria-label="Application version">
          © 2026 Bamboosato  v1.0.0
        </footer>
      )}
    </main>
  );
}

export default App;
