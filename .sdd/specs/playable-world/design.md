# 技術設計書

## アーキテクチャ概要
Vite + TypeScript の SPA に、Three.js（CDN）を用いた 1 人称 3D 表示を統合する。既存の `index.tsx` から初期化のみを残し、ゲームロジックは `src/world/*` のモジュールへ分割する。チャンク生成/メッシングは Web Worker に委譲し、メインスレッドは入力・描画・最小限の状態同期に専念する。

## 主要コンポーネント
### コンポーネント1：ChunkManager
- 責務：プレイヤー位置に基づくチャンクの生成/破棄、可視範囲の維持
- 入力：プレイヤー座標、描画距離、seed
- 出力：表示すべきチャンク集合（生成リクエスト/破棄イベント）
- 依存関係：`WorldGeneratorWorker`、`MesherWorker`、`ChunkStore`

### コンポーネント2：WorldGeneratorWorker（Worker）
- 責務：高さ関数（Simplex 予定）によるブロックID配列生成（16×16×H）
- 入力：seed、チャンク座標 (cx, cz)
- 出力：`ChunkData { key, blocks: Uint8Array }`
- 依存関係：`@/src/world/height.ts`（ノイズ）

### コンポーネント3：MesherWorker（Worker）
- 責務：`ChunkData` を実描画用メッシュへ変換（InstancedMesh もしくは Greedy Meshing）
- 入力：`ChunkData`
- 出力：メッシュバッファ（インデックス/頂点/法線/UV など）
- 依存関係：なし（アルゴリズム実装）

### コンポーネント4：Renderer
- 責務：Three.js 初期化、シーン/光源、描画ループ、DPR 上限制御
- 入力：コンフィグ（描画距離、DPR 上限）
- 出力：レンダー済みフレーム
- 依存関係：`ChunkManager`（メッシュ登録）、`HUD`

### コンポーネント5：InputController
- 責務：Pointer Lock、WASD/Space 入力、移動ベクトルとジャンプ制御
- 入力：DOM イベント
- 出力：プレイヤー制御量（速度/方向）
- 依存関係：`Renderer`（カメラ/コントロール）

### コンポーネント6：RaycastInteraction
- 責務：レイキャストでブロック設置/破壊、ロールオーバー表示
- 入力：カメラ、チャンクデータ
- 出力：変更差分（設置/破壊）
- 依存関係：`ChunkManager`、`ChunkStore`

### コンポーネント7：ChunkStore
- 責務：IndexedDB へのチャンク差分保存・復元
- 入力：`ChunkDelta`（設置/破壊）
- 出力：復元時の差分適用データ
- 依存関係：`idb-keyval` 相当（実装/ラッパ）

### コンポーネント8：HUD
- 責務：FPS/座標/ヘルプ表示の軽量 UI
- 入力：ゲームループの状態（フレーム時間、プレイヤー座標）
- 出力：画面オーバーレイ更新
- 依存関係：なし（DOM）

## データモデル
### ChunkKey
- `seed: string` — ワールド識別
- `cx: number`, `cz: number` — チャンク座標

### ChunkData
- `key: ChunkKey`
- `blocks: Uint8Array` — 長さ `16*16*H`、`BlockId` を格納

### BlockId（enum）
- 0: 空気, 1: 草, 2: 土, 3: 石, 4: 木, 5: 葉, 6: 砂, 7: 水

### Settings
- `renderDistance: number`, `dprMax: number`, `mouseSensitivity: number`

## 処理フロー
1. `index.tsx` で `Renderer` と `InputController` を初期化。`ChunkManager` を生成し、プレイヤー位置監視を開始。
2. `ChunkManager` が可視範囲の不足チャンクを `WorldGeneratorWorker` に要求。
3. 生成済み `ChunkData` を `MesherWorker` でメッシュ化し、`Renderer` のシーンに登録。
4. フレーム毎に `InputController` が速度/方向を更新し、`Renderer` が描画。`HUD` を更新。
5. `RaycastInteraction` が設置/破壊を行い、`ChunkStore` が差分を保存。対象チャンクメッシュを再生成（差分適用）。

## エラーハンドリング
- Pointer Lock 拒否：オーバーレイに再試行 UI を表示。
- IndexedDB 不可：保存機能を無効化し、警告を HUD に表示。
- WebGL/Three 読み込み失敗：エラーバナーとサポート情報を表示。

## 既存コードとの統合
- 変更が必要なファイル：
  - `index.tsx`：初期化/ループの責務を `Renderer`・`ChunkManager` 等へ移譲。
  - `index.html`：HUD 用コンテナ/ヘルプショートカットを追加（軽微）。
- 新規作成ファイル：
  - `src/world/chunkManager.ts`：可視範囲管理と Worker 連携
  - `src/world/generator.worker.ts`：チャンク生成（高さ関数）
  - `src/world/mesher.worker.ts`：メッシング（Instanced/Gready 選択）
  - `src/world/store.ts`：IndexedDB ラッパ
  - `src/world/raycast.ts`：設置/破壊とロールオーバー
  - `src/world/renderer.ts`：Three 初期化/ループ/DPR 上限
  - `src/world/input.ts`：Pointer Lock + 移動制御
  - `src/world/hud.ts`：FPS/座標表示
  - `src/world/types.ts`：型定義（ChunkKey/ChunkData/BlockId/Settings）

