import { useEffect, useMemo, useRef, useState } from 'react';
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
import { generateRandomParams, withFeedKill } from './simulation/random';
import {
  getFullscreenSimulationSize,
  NORMAL_SIMULATION_SIZE,
  type SimulationSize,
} from './simulation/size';
import type { ReactionDiffusionParams, SeedMode } from './simulation/types';

const APP_CANVAS_VIEW_QUERY = '(max-width: 820px), (pointer: coarse)';

function shouldUseAppCanvasView() {
  return window.matchMedia(APP_CANVAS_VIEW_QUERY).matches;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(defaultPreset.id);
  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => loadUserPresets());
  const [params, setParams] = useState<ReactionDiffusionParams>(defaultPreset.params);
  const [seedMode, setSeedMode] = useState<SeedMode>(defaultPreset.seedMode);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCanvasView, setIsCanvasView] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [simulationSize, setSimulationSize] = useState<SimulationSize>(NORMAL_SIMULATION_SIZE);
  const [resetKey, setResetKey] = useState(0);

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

  useEffect(() => {
    const syncFullscreenState = () => {
      const canvasIsFullscreen = document.fullscreenElement === canvasRef.current;
      const shouldUseViewportSize = canvasIsFullscreen || isCanvasView;
      const nextSimulationSize = shouldUseViewportSize
        ? getFullscreenSimulationSize(window.innerWidth, window.innerHeight)
        : NORMAL_SIMULATION_SIZE;

      setIsFullscreen(canvasIsFullscreen);
      setCanFullscreen(Boolean(canvasRef.current));
      setSimulationSize((current) =>
        current.width === nextSimulationSize.width && current.height === nextSimulationSize.height
          ? current
          : nextSimulationSize,
      );
    };

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    window.addEventListener('resize', syncFullscreenState);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      window.removeEventListener('resize', syncFullscreenState);
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
  };

  const handleFeedChange = (feed: number) => {
    setParams((current) => withFeedKill(current, feed, current.kill));
    setSelectedPresetId(null);
  };

  const handleKillChange = (kill: number) => {
    setParams((current) => withFeedKill(current, current.feed, kill));
    setSelectedPresetId(null);
  };

  const handleRandomize = () => {
    const randomPattern = generateRandomParams();
    setSelectedPresetId(null);
    resetSimulation(randomPattern.params, randomPattern.seedMode);
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
            seedMode={seedMode}
            simulationSize={simulationSize}
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

          <label className="field range-field">
            <span>
              Feed <strong>{params.feed.toFixed(4)}</strong>
            </span>
            <input
              type="range"
              min="0.012"
              max="0.07"
              step="0.0005"
              value={params.feed}
              onChange={(event) => handleFeedChange(Number(event.target.value))}
              aria-label="Feed rate"
            />
          </label>

          <label className="field range-field">
            <span>
              Kill <strong>{params.kill.toFixed(4)}</strong>
            </span>
            <input
              type="range"
              min="0.045"
              max="0.072"
              step="0.0005"
              value={params.kill}
              onChange={(event) => handleKillChange(Number(event.target.value))}
              aria-label="Kill rate"
            />
          </label>

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

          <div className="button-row">
            <button type="button" onClick={handleRandomize}>
              Random
            </button>
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
    </main>
  );
}

export default App;
