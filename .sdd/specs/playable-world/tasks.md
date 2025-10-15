# 実装タスクリスト

## セクション1：データモデル実装
- [x] 1.1 型定義を実装する（`src/world/types.ts`）
  - `ChunkKey`, `ChunkData(Uint8Array)`, `BlockId(enum)`, `Settings`
  - インデックス変換ヘルパー（(x,y,z)⇔offset）と境界バリデーション
- [x] 1.2 データ永続化層を実装する（`src/world/store.ts`）
  - IndexedDB（idb-keyval 相当）ラッパ。キー: `world:{seed}:{cx}:{cz}`
  - CRUD: `loadDelta/saveDelta/clearWorld`、メモリフォールバック

## セクション2：ビジネスロジック実装
- [x] 2.1 WorldGeneratorWorker を実装（`src/world/generator.worker.ts`）
  - 16×16×H の高さ関数（現状 sin/cos、拡張で Simplex）
  - design.md 処理フロー(2) に対応（純関数 `generateChunk` + Worker 薄ラッパ）
- [x] 2.2 MesherWorker を実装（`src/world/mesher.worker.ts`）
  - まずは露出面のナイーブメッシング（四角面）で実装、Greedy へ拡張可能
  - design.md 処理フロー(3) に対応（純関数 `meshChunk` + Worker ラッパ）
- [x] 2.3 ChunkManager を実装（`src/world/chunkManager.ts`）
  - 可視範囲管理/生成要求/破棄（Chebyshev 半径）。外側はアンロード
  - design.md 処理フロー(2)(3) に対応（純状態 + キュー）
- [x] 2.4 エラーハンドリングを実装
  - `withTimeout` でタイムアウト例外と警告を発火、`BrowserIdbStore` は IDB 不可時に警告しメモリへフォールバック

## セクション3：インターフェース実装
- [x] 3.1 Renderer を実装（`src/world/renderer.ts`）
  - DPR 上限とメッシュ登録 API（Three 統合は次段階）
- [x] 3.2 InputController を実装（`src/world/input.ts`）
  - WASD の方向ベクトル算出（正規化）
- [x] 3.3 RaycastInteraction を実装（`src/world/raycast.ts`）
  - レイキャスト結果の範囲判定と最接近ヒット選択
- [x] 3.4 HUD を実装（`src/world/hud.ts`）
  - FPS/座標フォーマッタ（UI結線は次段階）

## セクション4：統合とテスト
- [x] 4.1 index.tsx へ統合（HUD結線）
  - `index.html` に HUD コンテナを追加し、`formatFps/formatCoords` で更新
- [ ] 4.2 基本的な動作テストを実装
  - Vitest を導入し、型ユーティリティ/インデックス計算のユニットテスト
  - スモーク: シーン起動、Pointer Lock、WASD/ジャンプで例外なし
- [ ] 4.3 受入基準の確認
  - フルHD・DPR≤2・既定描画距離で 60fps 目標（最低30fps）
  - 100回連続の設置/破壊で位置誤差 ±0.01 以内

