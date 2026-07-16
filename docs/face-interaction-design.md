# 視線・瞬きインタラクション設計

## 1. 目的と前提

MediaPipe Tasks Vision の Face Landmarker をブラウザ内で実行し、カメラ映像をサーバーへ送信せずに、視線方向と瞬きだけを Turing パターンへの入力として利用する。

既存のタップ・ドラッグ刺激と同じ局所刺激経路を再利用する。Face Landmarker は入力の検出、視線・眼状態モジュールは判定、Canvas は刺激の適用を担当する。

## 2. 構成

追加する責務は次の 4 つに分離する。

| 責務 | 推奨モジュール | 内容 |
| --- | --- | --- |
| カメラ制御 | `camera/FaceInteractionController` | ユーザー操作で開始・停止、権限エラー、MediaStream 解放 |
| Face Landmarker | `camera/FaceLandmarkerRunner` | モデル初期化、`detectForVideo` 呼び出し、1人目の顔だけを採用 |
| 判定ロジック | `simulation/faceInteraction` | 視線方向、瞬き、閉眼時間、状態遷移を純粋関数で判定 |
| Canvas 統合 | `SimulationCanvas` | 視線位置への刺激、閉眼中の停止、開眼時イベント |

React の state は表示状態に限定し、検出結果・状態機械・MediaStream・`requestAnimationFrame` は `useRef` で保持する。これにより、カメラフレームごとの再レンダーを避ける。

## 3. CDN モデル配布

初期実装ではモデルを CDN URL からロードする。URL は定数化し、Face Landmarker 初期化失敗時はカメラを停止してエラー表示へ遷移する。

```ts
const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
```

将来 CDN 障害やオフライン要件が発生した場合は、同じ初期化インターフェースに `public/models/face_landmarker.task` を渡すフォールバックを追加する。

## 4. 視線方向

MVP は正確な注視点ではなく、5 方向だけを判定する。

```ts
type GazeDirection = 'up' | 'down' | 'left' | 'right' | 'center' | 'unknown';
```

左右の虹彩中心を各眼の輪郭矩形に対して正規化し、左右平均・上下平均を顔の向き補正後の相対値として扱う。閾値付近のちらつきを防ぐため、次を適用する。

- 直近 3〜5 フレームの移動平均
- 現在方向から別方向へ遷移する際のヒステリシス
- 顔未検出時は直前方向を短時間（初期値 300ms）保持し、その後 `unknown`
- `unknown` は刺激位置を選択する際のみ `center` として扱う

刺激位置は次の正規化座標を使う。

```ts
const STIMULUS_POSITIONS = {
  up: { x: 0.5, y: 0.2 },
  down: { x: 0.5, y: 0.8 },
  left: { x: 0.2, y: 0.5 },
  right: { x: 0.8, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
} as const;
```

## 5. 瞬き・閉眼状態機械

瞬きと長時間閉眼は視線方向とは独立したイベントとして扱う。両目の閉眼係数の平均値を使い、左右別ウインクは区別しない。

```text
OPEN
  └─ 閉眼閾値を一定フレーム下回る
      ↓
CLOSED
  ├─ eyesClosedMs < 1200ms: 通常閉眼
  ├─ eyesClosedMs >= 1200ms: longClosePending = true
  └─ 開眼
      ↓
OPEN
  ├─ longClosePending = false: blink イベントを1回発火
  └─ longClosePending = true: longClose イベントを1回発火
```

```ts
type EyeState = 'open' | 'closed';

type EyeInteractionState = {
  eyeState: EyeState;
  eyesClosedMs: number;
  longClosePending: boolean;
};
```

長時間閉眼の刺激は、閉眼中ではなく開眼へ戻ったフレームで発火する。ユーザーが刺激を認識できるタイミングを優先するためである。

## 6. 刺激と速度

既存の `injectActivator` を利用し、視線方向に応じた Canvas 座標へ変換する。

```ts
type StimulusConfig = {
  radius: number;
  intensity: number;
  durationMs: number;
};
```

- 通常の瞬き: 中程度の強度で 1 回
- 長時間閉眼からの開眼: 強い強度で 1 回
- 同一の閉眼区間からイベントを複数回発火しない
- 閉眼中はシミュレーションを停止する
- 開眼時に通常速度へ復帰する

Canvas の既存 `isPaused` と競合しないよう、ユーザー一時停止と閉眼停止を分離する。

```ts
const effectivePaused = userPaused || eyeClosed;
```

## 7. カメラ状態

```ts
type CameraStatus =
  | 'idle'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'permission-denied'
  | 'model-error'
  | 'unsupported';
```

開始は必ずボタン操作から行う。停止、`pagehide`、`visibilitychange`、React の cleanup では次を実行する。

1. 検出用 `requestAnimationFrame` をキャンセル
2. `video.srcObject` を解除
3. 全 `MediaStreamTrack.stop()` を呼び出す
4. Face Landmarker を close 可能なら解放
5. 表示状態を `idle` へ戻す

## 8. UI

- 「カメラを開始」「カメラを停止」ボタン
- カメラ状態
- Face Landmarker 初期化エラー／権限拒否エラー
- 現在の視線方向（`center` など）
- 目の状態（開眼／閉眼）と `eyesClosedMs`
- カメラなしでも既存シミュレーションを完全に操作可能
- `video` は必要に応じて非表示または小さなプレビューとし、映像データを保存しない

## 9. テスト設計

### 機能

- 正常なランドマークから 5 方向を判定できる
- 閾値境界で方向が過剰に切り替わらない
- 顔未検出後 300ms 以内は直前方向を保持し、その後 `unknown` になる
- 通常の瞬きで `blink` が 1 回だけ発火する
- 1200ms 未満の閉眼では `longClose` が発火しない
- 1200ms 以上閉眼して開眼した時だけ `longClose` が 1 回発火する
- 瞬き／長時間閉眼の刺激位置が視線方向と一致する

### 異常系

- カメラ権限拒否でアプリ全体が停止しない
- モデルロード失敗時に MediaStream が残らない
- Face Landmarker が空結果を返しても例外にならない
- NaN、範囲外座標、複数顔を安全に処理する

### 非機能・環境差

- デスクトップ／モバイルのカメラ許可フロー
- HTTPS または localhost 以外での `getUserMedia` 非対応表示
- 低フレームレート時の状態遷移と重複イベント
- タブ離脱・バックグラウンド化時の MediaStream 解放
- カメラ映像・ランドマークがネットワーク送信されないこと

