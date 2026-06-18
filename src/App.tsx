import { useEffect, useMemo, useRef, useState } from 'react';
import { SimulationCanvas } from './components/SimulationCanvas';
import { patternPresets, defaultPreset } from './presets/presets';
import { generateRandomParams, withFeedKill } from './simulation/random';
import {
  getFullscreenSimulationSize,
  NORMAL_SIMULATION_SIZE,
  type SimulationSize,
} from './simulation/size';
import type { ReactionDiffusionParams, SeedMode } from './simulation/types';

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState(defaultPreset.id);
  const [params, setParams] = useState<ReactionDiffusionParams>(defaultPreset.params);
  const [seedMode, setSeedMode] = useState<SeedMode>(defaultPreset.seedMode);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [simulationSize, setSimulationSize] = useState<SimulationSize>(NORMAL_SIMULATION_SIZE);
  const [resetKey, setResetKey] = useState(0);

  const selectedPreset = useMemo(
    () => patternPresets.find((preset) => preset.id === selectedPresetId),
    [selectedPresetId],
  );

  useEffect(() => {
    const syncFullscreenState = () => {
      const canvasIsFullscreen = document.fullscreenElement === canvasRef.current;

      setIsFullscreen(canvasIsFullscreen);
      setCanFullscreen(document.fullscreenEnabled !== false && Boolean(canvasRef.current?.requestFullscreen));
      setSimulationSize(
        canvasIsFullscreen
          ? getFullscreenSimulationSize(window.innerWidth, window.innerHeight)
          : NORMAL_SIMULATION_SIZE,
      );
    };

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    window.addEventListener('resize', syncFullscreenState);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      window.removeEventListener('resize', syncFullscreenState);
    };
  }, []);

  const resetSimulation = (nextParams: ReactionDiffusionParams, nextSeedMode: SeedMode) => {
    setParams(nextParams);
    setSeedMode(nextSeedMode);
    setResetKey((current) => current + 1);
  };

  const handlePresetChange = (presetId: string) => {
    const preset = patternPresets.find((candidate) => candidate.id === presetId) ?? defaultPreset;
    setSelectedPresetId(preset.id);
    resetSimulation(preset.params, preset.seedMode);
  };

  const handleFeedChange = (feed: number) => {
    setParams((current) => withFeedKill(current, feed, current.kill));
    setSelectedPresetId('custom');
  };

  const handleKillChange = (kill: number) => {
    setParams((current) => withFeedKill(current, current.feed, kill));
    setSelectedPresetId('custom');
  };

  const handleRandomize = () => {
    const randomPattern = generateRandomParams();
    setSelectedPresetId('custom');
    resetSimulation(randomPattern.params, randomPattern.seedMode);
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

  const handleFullscreen = async () => {
    const canvas = canvasRef.current;

    if (!canvas?.requestFullscreen) {
      return;
    }

    try {
      if (document.fullscreenElement === canvas) {
        await document.exitFullscreen();
        return;
      }

      await canvas.requestFullscreen();
    } catch {
      setIsFullscreen(false);
    }
  };

  return (
    <main className="app-shell">
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
        <div className="canvas-stage">
          <SimulationCanvas
            canvasRef={canvasRef}
            params={params}
            isPaused={isPaused}
            resetKey={resetKey}
            seedMode={seedMode}
            simulationSize={simulationSize}
          />
        </div>

        <aside className="control-panel" aria-label="Simulation controls">
          <label className="field">
            <span>Preset</span>
            <select
              value={selectedPresetId}
              onChange={(event) => handlePresetChange(event.target.value)}
              aria-label="Pattern preset"
            >
              <option value="custom">Custom</option>
              {patternPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>

          <p className="preset-description">
            {selectedPreset?.description ?? 'A custom parameter set generated from the controls.'}
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
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
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
