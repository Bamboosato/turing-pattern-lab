# 顔・視線・瞬きインタラクション設計

2026-10-06時点の実装に合わせた設計記録。実装済みの挙動と残っている設計課題を分けて記載する。

## 1. 目的と前提

MediaPipe Tasks Vision の Face Landmarker をブラウザ内で実行し、カメラ映像・ランドマークを保存・送信せずに、顔の向きと虹彩の移動を組み合わせた5方向判定および瞬きをパターンへの入力として利用する。画面上の正確な注視点を追跡する機能ではない。

既存のタップ・ドラッグ刺激と同じ局所刺激経路を再利用する。Face Landmarker は入力の検出、視線・眼状態モジュールは判定、Canvas は刺激の適用を担当する。

## 2. 構成

現在の責務は次のファイルに配置している。

| 責務 | 実装ファイル | 内容 |
| --- | --- | --- |
| カメラ・推論・表示 | `src/components/FaceInteractionPanel.tsx` | getUserMedia、モデル初期化、検出ループ、開始・停止・エラー表示 |
| 判定ロジック | `src/simulation/faceInteraction.ts` | 虹彩正規化、顔行列変換、自動基準値、5方向判定、閉眼イベント |
| ReactとCanvasの橋渡し | `src/App.tsx` | 閉眼フラグと刺激をrefへ格納、イベントに応じた強度設定 |
| 刺激・時間発展 | `src/components/SimulationCanvas.tsx` | refの刺激を消費し、`injectActivator`で適用、閉眼時の計算ステップ停止 |

当初案の`camera/FaceInteractionController` / `camera/FaceLandmarkerRunner`への分割は実施していない。MediaStream、Face Landmarker、アニメーションフレーム、判定状態はrefで保持するが、GazeとEyesの表示には検出ループからReact stateを更新する。Canvasの計算ループ自体はReactの再レンダーに依存しない。

## 3. モデル・実行設定

現在のロード先は次の固定URLである。モデル初期化失敗時は取得済みリソースを停止してエラーを表示する。

```text
モデル: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
WASM: https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm
```

- カメラ: `video: { facingMode: 'user' }, audio: false`
- Face Landmarker: `runningMode: 'VIDEO'`, `numFaces: 1`, `delegate: 'GPU'`
- blendshapesと顔変換行列を出力し、検出結果の先頭の顔を使う
- videoは非表示、muted、playsInlineとする

カメラ取得・video再生後にWASMとモデルを初期化し、`requestAnimationFrame`で`detectForVideo`を呼ぶ。カメラ利用にはHTTPSまたはlocalhost等のsecure context、権限、対応した推論環境が必要となる。ネットワーク接続は初期化に必要で、ローカルモデルへのフォールバックとCPU delegateへの再試行は未実装である。シミュレーション描画はCanvas 2Dであり、このGPU指定は顔推論に限定される。

## 4. 顔の向きと虹彩による方向判定

### 4.1 入力信号

`getGazeFromFaceLandmarks`は左右の虹彩中心をそれぞれの目の輪郭座標に対して正規化して平均する。縦方向を反転し、パネル側でさらに横方向を反転して利用する。必要な点が欠ける、または目の正規化幅が小さすぎる場合はnullを返す。

`getHeadSignalFromMatrix`は顔の4×4変換行列からyaw / pitchを求め、左右・上下の符号付き信号へ変換する。行列がない、または16要素未満ならnullを返す。

### 4.2 自動基準値

手動キャリブレーション画面はなく、`updateFaceInteractionState`が`collecting` → `provisional` → `stable`の状態を管理する。

- 安定した開眼入力を800ms収集すると暫定基準値を採用する
- 安定入力が3000msに達するとstableへ移る
- 収集中は顔のyawと時間的安定性を使い、スマートフォン前面カメラの高さによるpitchの偏りを許容する
- 基準確立後は学習した顔向きに対する相対的な正面条件も確認する
- 中央方向で安定している時だけ基準値を緩やかに更新し、更新幅・総ドリフトを制限する
- パネルは閉眼中に方向判定を更新しない。瞬きイベント後700msは基準値の更新を抑制するためのフラグを渡す。これは次の瞬き刺激を禁止するクールダウンではない

800ms / 3000msは安定入力の蓄積時間であり、カメラ開始から必ずその時間で完了するという意味ではない。

### 4.3 合成・平滑化

基準値に対する虹彩と顔向きの差を合成する。正面付近では眼／顔の重みを0.7／0.3、顔が外れた時は0.4／0.6とし、信頼度を掛ける。基準収集中は眼の重みを0にする。

合成信号は時定数120msの時間平滑化を行う。最大軸の絶対値が0.16未満なら中央とし、それ以外は優勢軸で上下左右を決める。候補方向が150ms続いた後に表示・刺激方向を切り替える。直近3〜5フレームの移動平均や独立したヒステリシスは現在の実装方式ではない。

`classifyGaze`は眼信号だけを分類する単体関数として存在するが、実際のパネルは上記の顔・虹彩合成結果を利用する。

### 4.4 刺激位置と顔消失

方向型には次の値があるが、合成判定の出力はunknownを含まない5方向である。

```ts
type GazeDirection = 'up' | 'down' | 'left' | 'right' | 'center' | 'unknown';
```

`normalizeGazeDirection`はunknownを刺激位置選択時にcenterへ変換する。顔未検出時は検出フラグと信頼度を更新し、方向・基準値を保持する。以前の設計案にあった「300ms保持後にunknown」は未実装で、パネルのGaze / Eyes表示と閉眼フラグも顔消失時には更新されない。

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

瞬きと長時間閉眼は方向とは独立したイベントとして扱う。`eyeBlinkLeft` / `eyeBlinkRight`の係数合計を2で割り、0.55を超えると閉眼とする。現状は複数フレームによる閉眼確定や左右別ウインク判定を行わない。

```text
OPEN
  └─ 閉眼係数平均 > 0.55
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

開眼を維持しても同じ閉眼区間のイベントは再発火しない。時間は検出ループ間の経過時間であり、低fps・検出中断・再開始を含む時間計測は実機で確認する必要がある。

## 6. 刺激と速度

既存の`injectActivator`を利用し、判定方向に応じたCanvas座標へ変換する。`App.tsx`は刺激をrefへ格納し、Canvasは次の描画フレームで1回消費する。半径は`max(4, width * 0.04)`とし、持続時間を持たない。視線方向のみでは継続注入しない。

- 通常の瞬き: 強度0.58で1回
- 長時間閉眼からの開眼: 強度0.95で1回
- 同一の閉眼区間からイベントを複数回発火しない
- 閉眼中は反応拡散の計算ステップを停止する
- 開眼時にユーザーがPause中でなければ時間発展へ復帰する

Canvas の既存 `isPaused` と競合しないよう、ユーザー一時停止と閉眼停止を分離する。

```ts
const effectivePaused = userPaused || eyeClosed;
```

刺激の適用、モーション・音声による攪拌、色描画はこの停止条件の外にあり、閉眼・Pause中も実行される。

## 7. カメラ状態とUI

```ts
type Status =
  | 'idle'
  | 'starting'
  | 'active'
  | 'error';
```

開始は必ずStart Camera操作から行う。starting / active中は開始ボタンが無効、Stop Cameraはactive中のみ有効となる。Eye interactionの状態、Gaze、Eyes（OPEN / CLOSEDと経過ms / BLINK / LONG CLOSE）を表示する。

開始時のNotAllowedErrorは`Camera permission was denied.`、その他の失敗は`Camera or face model initialization failed.`をalert表示する。未対応環境の事前専用表示はなく、開始時の一般エラーとして扱う。

正常な停止とReactのcleanupでは次を実行する。開始処理の例外でも同じ停止処理を使い、その後errorへ移る。開始中の解除に関する競合は次節の課題に含める。

1. 検出用 `requestAnimationFrame` をキャンセル
2. `video.srcObject` を解除
3. 全 `MediaStreamTrack.stop()` を呼び出す
4. Face Landmarker を close 可能なら解放
5. 表示状態を `idle` へ戻す

## 8. 残っている設計課題

次の項目はコード比較で確認した未実装事項・未検証リスクであり、実装済みの保証として扱わない。カメラを開始せずに既存シミュレーションを操作することは可能だが、開始後の停止・顔消失には以下の課題が残る。

| 優先度 | 課題 | 影響・確認する条件 |
| --- | --- | --- |
| 重大 | `visibilitychange` / `pagehide`でのカメラ停止 | Audio noiseと異なり明示的なバックグラウンド停止がない。カメラリソース解放の確認が必要 |
| 重大 | カメラ停止・顔消失時の閉眼フラグ解除 | CLOSEDのまま停止・顔消失するとAppの閉眼停止が残る経路がある。再開・再読み込みの状態遷移を確認する |
| 重大 | 開始処理のキャンセル・世代管理 | getUserMedia / モデル初期化中の解除後に処理が完了する競合を防ぐ仕組みがない。取得済み・後から取得されたリソースを区別して解放する設計が必要 |
| 重大 | 検出ループ例外の処理 | `detectForVideo`の実行時例外に対する停止・エラー表示経路がない |
| 軽微 | 顔消失タイムアウトと表示更新 | 保持した方向・Eyes表示が古いまま残る。300ms後unknownという当初案は未実装 |
| 軽微 | 再開始時の時間・表示リセット | `lastTimeRef`、Gaze、Eyes、Appの閉眼フラグは開始・停止時に初期化されない。閉眼時間に停止区間が含まれる可能性を確認する |
| 軽微 | 推論・外部配信のフォールバック | ローカルモデル、CPU delegateへの再試行、未対応専用表示がない |

閉眼状態が停止後に残る場合は、現在の実装では再読み込みで初期状態に戻る。顔消失からの再検出でも開眼入力を取得すれば解除されるが、単体テストだけでライフサイクル全体を保証しない。今回の文書整合ではアプリのコード変更は行っていない。

## 9. テスト設計と実施範囲

### 9.1 観点を先に整理する

- 機能: 虹彩・顔方向合成、自動基準値、方向保持、刺激位置、瞬きイベント、ユーザーPauseとの共存
- データ: 点不足、行列不足、不正数値、閾値、閉眼時間、保存対象外のセッション状態
- UI: 開始／停止の可否、Gaze / Eyes / エラー表示、カメラなしの操作、顔消失後の表示
- 非機能: 端末・OS・ブラウザー差、secure context、GPU、権限、モデル配信障害、低fps、非同期競合、リソース解放

### 9.2 既存の自動テスト

`src/simulation/faceInteraction.test.ts`は純粋関数を対象とし、次を検証する。

- 正常系: 短い閉眼後のblink、長い閉眼後のlongClose、方向分類、刺激座標、眼輪郭に対する虹彩位置、顔行列の方向変換
- 境界・データ: unknownのcenter変換、方向分類の中央領域、1200msに達した閉眼、上下方向の反転
- 状態遷移: 安定開眼後の暫定基準値、スマートフォン高さ相当のpitchでの収集、方向保持中の基準値維持、正面時の眼移動優先

これはカメラ・モデル・Canvas統合のE2Eではない。1200ms直前の境界、顔消失タイムアウト、不正数値、権限拒否や開始中断等の網羅を示すものでもない。

### 9.3 追加確認が必要なケース

| 分類 | 前提・操作 | 検証意図 |
| --- | --- | --- |
| 正常系 | HTTPS、カメラ未使用、権限許可。開始→瞬き→停止 | 刺激方向・強度と通常のリソース解放を確認 |
| 異常系 | 権限拒否、モデル/WASM取得失敗、GPU初期化・検出失敗 | 通常操作の継続、エラー表示、取得済みリソースの解放を確認 |
| 境界値 | 係数0.55前後、閉眼1199/1200/1201ms、方向150ms前後、基準800/3000ms前後 | 判定境界とイベント重複防止を確認 |
| 状態遷移 | 開始中の解除、CLOSED中の停止・顔消失、再開始、Pauseとの組合せ | 停止の取り残しと非同期完了後のリソース残留を検出 |
| 環境差 | デスクトップ／モバイル、低fps、非secure context、背景化、CDN遮断 | タイミング・権限・環境依存の切り分けと通信先を確認 |

実ブラウザー確認時は権限・タブ表示・カメラの前提状態を明示し、同一実機で並列実行しない。対象ケース／クロスブラウザー等の範囲をリスクに応じて選び、操作順序・ログ・証跡・未実施範囲を記録する。上記未実装課題は期待どおり通るテストとして扱わない。

