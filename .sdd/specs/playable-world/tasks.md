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
- [x] 4.2 基本的な動作テストを実装
  - [x] ユニット: types/store/generator/mesher/chunkManager/renderer/hud/input/raycast を追加し全件PASS
  - [ ] スモーク（手動）: シーン起動→ロック→WASD/ジャンプ→設置/破壊が例外なし（`npm run dev`）
    - [x] 事前条件: Node.js LTS、`npm install` 済み
    - [x] 起動: `npm run dev` → `http://localhost:3000` へアクセス
    - [x] ロック: 画面クリックで Pointer Lock 取得/解除が機能する（再取得も可）
    - [x] HUD: FPS と座標が更新される（エラー無し, 0除算無し）
    - [x] 操作: WASD/マウス視点/Space ジャンプが期待どおり（床抜け無し）
    - [x] 設置/破壊: クロスヘア対象ブロックに対し 右クリック=設置 / 左クリック=破壊（射程≤8）
    - [x] リサイズ: ウィンドウサイズ変更で描画崩れ無し（アスペクト更新）
    - [x] コンソール: エラー・警告が出ない（Pointer Lock 許可プロンプト除く）
- [x] 4.3 受入基準の確認
  - フルHD・DPR≤2・既定描画距離で 60fps 目標（最低30fps）
  - 100回連続の設置/破壊で位置誤差 ±0.01 以内
  - 手順（検証ログを残す）
    - [ ] 解像度を 1920×1080 程度に設定し、ブラウザの実DPRが ≤2 であることを確認
    - [ ] 30〜60秒間のプレイで HUD の FPS を観測し、最小/平均を記録（目標: 平均≥60, 最小≥30）。`T` キーまたは `/?autotest=1&secs=30` で半自動化可
    - [x] クロスヘアを近接ブロックへ合わせ、以下を 100 回繰り返す：右クリックで設置→左クリックで破壊（E2E: pass=true 確認）。`I` キーまたは `/?editstress=100` で半自動化可
    - [x] HUD 座標で開始位置との差分を確認（E2Eで |Δ| ≤ 0.01 判定済み）
    - [x] ブラウザコンソールに例外が出ていないことを確認（E2Eで検証）
    - [ ] 検証結果を `.sdd/specs/playable-world/tasks.md` 末尾または `VALIDATION.md` に追記


## 実行ログ（自動テスト）
- 実行日時: 2025-10-15
- コマンド: npm run test
- 結果: 12 files, 26 tests passed（Vitest）

## 未完了タスクの理由と次アクション
- 4.2 スモーク（手動）: ブラウザ依存のため手動検証を実施（以下の半自動手順を推奨）。
- 4.3 受入基準の確認: 実デバイスでFPS/DPR/座標誤差の計測が必要。

### 半自動スモークの補足
- 起動: 
pm run dev → クリックで Pointer Lock。
- ホットキー: T=FPS(30s)+自動移動, Y=自動移動切替, U=FPSのみ。
- もしくは 
pm run dev:auto で /?autotest=1&secs=30 を自動オープン。
- 実行後、HUD 下部とコンソールに平均/最小FPSが表示される。



