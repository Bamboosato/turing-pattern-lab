import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  createEyeInteractionState,
  createFaceInteractionState,
  getGazeFromFaceLandmarks,
  getHeadSignalFromMatrix,
  normalizeGazeDirection,
  STIMULUS_POSITIONS,
  updateEyeInteraction,
  updateFaceInteractionState,
  type GazeDirection,
  type EyeEvent,
} from '../simulation/faceInteraction';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const TASKS_VISION_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

type Status = 'idle' | 'starting' | 'active' | 'error';

export function FaceInteractionPanel({ onEyeEvent, onEyeClosedChange }: { onEyeEvent?: (event: EyeEvent, position: { x: number; y: number }) => void; onEyeClosedChange?: (closed: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const frameRef = useRef<number | null>(null);
  const eyeStateRef = useRef(createEyeInteractionState());
  const faceStateRef = useRef(createFaceInteractionState());
  const lastStimulusAtRef = useRef(0);
  const lastTimeRef = useRef(0);
  const gazeRef = useRef<GazeDirection>('unknown');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [gaze, setGaze] = useState<GazeDirection>('unknown');
  const [eyeLabel, setEyeLabel] = useState('OPEN');

  useEffect(() => () => stop(), []);

  async function start() {
    if (status === 'starting' || status === 'active') return;
    setStatus('starting'); setError('');
    eyeStateRef.current = createEyeInteractionState();
    faceStateRef.current = createFaceInteractionState();
    lastStimulusAtRef.current = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error('Video element unavailable');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const vision = await FilesetResolver.forVisionTasks(TASKS_VISION_WASM_URL);
      landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      setStatus('active');
      frameRef.current = requestAnimationFrame(loop);
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === 'NotAllowedError' ? 'Camera permission was denied.' : 'Camera or face model initialization failed.');
      stop(); setStatus('error');
    }
  }

  function stop() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close(); landmarkerRef.current = null;
    setStatus('idle');
  }

  function loop(time: number) {
    const video = videoRef.current; const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) { frameRef.current = requestAnimationFrame(loop); return; }
    const result = landmarker.detectForVideo(video, time);
    const face = result.faceLandmarks?.[0];
    if (face) {
      const blend = result.faceBlendshapes?.[0]?.categories ?? [];
      const blink = blend
        .filter((item) => item.categoryName === 'eyeBlinkLeft' || item.categoryName === 'eyeBlinkRight')
        .reduce((sum, item) => sum + item.score, 0) / 2 > 0.55;
      const eyeLocalGaze = getGazeFromFaceLandmarks(face);
      const eyeSignal = eyeLocalGaze
        ? { x: 1 - eyeLocalGaze.x, y: eyeLocalGaze.y }
        : null;
      const headSignal = getHeadSignalFromMatrix(result.facialTransformationMatrixes?.[0]?.data);
      if (!blink) {
        faceStateRef.current = updateFaceInteractionState(faceStateRef.current, {
          timestampMs: time,
          isFaceDetected: true,
          eyeSignal,
          headSignal,
          isBlinking: false,
          areEyesClosed: false,
          stimulusCooldown: time - lastStimulusAtRef.current < 700,
        });
      }
      gazeRef.current = faceStateRef.current.attentionDirection;
      setGaze(gazeRef.current);
      const delta = lastTimeRef.current ? time - lastTimeRef.current : 16;
      const next = updateEyeInteraction(eyeStateRef.current, blink, delta);
      eyeStateRef.current = next.state; onEyeClosedChange?.(next.state.eyeState === 'closed');
      if (next.event !== 'none') {
        lastStimulusAtRef.current = time;
        onEyeEvent?.(next.event, STIMULUS_POSITIONS[normalizeGazeDirection(gazeRef.current)]);
      }
      setEyeLabel(next.state.eyeState === 'closed' ? `CLOSED (${Math.round(next.state.eyesClosedMs)}ms)` : next.event === 'longClose' ? 'LONG CLOSE' : next.event === 'blink' ? 'BLINK' : 'OPEN');
    } else {
      faceStateRef.current = updateFaceInteractionState(faceStateRef.current, {
        timestampMs: time,
        isFaceDetected: false,
        isBlinking: false,
        areEyesClosed: false,
      });
    }
    lastTimeRef.current = time; frameRef.current = requestAnimationFrame(loop);
  }

  return <section className="motion-control face-interaction-panel" aria-label="Eye interaction controls">
    <span className="motion-control__label">
      Eye interaction <strong aria-live="polite">{status}</strong>
    </span>
    <div className="face-interaction-panel__actions">
      <button type="button" onClick={start} disabled={status === 'starting' || status === 'active'}>
        Start Camera
      </button>
      <button type="button" onClick={stop} disabled={status !== 'active'}>
        Stop Camera
      </button>
    </div>
    <p className="face-interaction-panel__status">Gaze: {gaze} · Eyes: {eyeLabel}</p>
    {error && <p role="alert">{error}</p>}
    <video ref={videoRef} muted playsInline aria-hidden="true" style={{ display: 'none' }} />
  </section>;
}
