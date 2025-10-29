# ブロックワールド（Vite + Three.js）

指向性ライト付きの 3D サンドボックスです。Procedural な地形発生、ブロック設置/破壊、ホットバー付き HUD、開発者向けバリデーション機能を備えています。最新版では TNT ブロックを追加し、点火から爆発、連鎖反応までの挙動を実装しました。

## プロジェクト概要
- ランタイムエントリ: `index.tsx`
- マークアップ / スタイル: `index.html`, `index.css`
- ゲームロジック: `src/world/`（型、チャンク生成、メッシング、入力、HUD など）
- バンドラ: [Vite](https://vitejs.dev/)（エイリアス `@` → プロジェクトルート）
- レンダリング: [Three.js 0.128.0](https://threejs.org/) を CDN から読み込み

## 主な機能
- 16×16×128 チャンクの高さマップ生成（Grass / Dirt / Sand / Snow などのバイオーム）
- ホットバー & インベントリ UI からのブロック設置 / 破壊（射程 8）
- ローカルストレージでの編集永続化（再訪時に復元）
- HUD（FPS / 座標表示）と検証用オーバーレイ（FPS ロガー、オートプレイ）
- **TNT ブロック**: 左クリックで点火 → 約 2.8 秒後に爆発。半径内ブロックを破壊し、TNT は連鎖点火、Obsidian は耐性あり
- Pointer Lock コントロール + WASD 移動（壁衝突 & 自動ジャンプ対応）

## セットアップと実行
前提: Node.js（LTS 推奨）

```bash
npm install                    # 依存関係の取得
cp .env.local.example .env.local  # 必要に応じて環境変数を設定（GEMINI_API_KEY など）
npm run dev                    # http://localhost:3000 で開発サーバー起動
```

その他コマンド:
- `npm run build` : 最適化ビルドを `dist/` に生成
- `npm run preview` : ビルド済み `dist/` をローカルで配信
- `npx tsc --noEmit` : 型チェックのみ

## 操作方法
- 視点: マウス（画面クリックで Pointer Lock を取得）
- 移動: `W` `A` `S` `D`
- ジャンプ: `Space`
- スプリント: `Shift`（速度 ×1.8）
- ブロック設置: 右クリック（ホットバーに応じたブロック）
- ブロック破壊: 左クリック
- **TNT**: 左クリックで点火。約 2.8 秒後に爆発し、隣接 TNT は 1.2 秒で連鎖
- ホットバー切替: `1`〜`5` または枠をクリック
- インベントリ: `E` で開閉（ホットバーへのドラッグ＆ドロップ代替）

## 開発者向けホットキー（Pointer Lock 取得後）
- `T`: 30 秒 FPS ログ + オートプレイ開始
- `U`: 30 秒 FPS ログのみ
- `Y`: オートプレイの ON / OFF
- `I`: Edit Stress テスト（設置/破壊 100 回）
- URL パラメータ: `/?autotest=1&secs=30`, `/?editstress=100`
- ショートカット: `npm run dev:auto`（autotest パラメータ付きで起動）

## テスト
Vitest と Playwright を使用しています。

```bash
# ユニットテスト
npm run test

# エンドツーエンド（Chromium）
npx playwright install chromium
npx playwright test
```
- `e2e/smoke.spec.ts`: Pointer Lock, HUD 更新, 設置/破壊, リサイズ, コンソール無エラーを検証
- `e2e/editstress.spec.ts`: 設置/破壊 100 回後の座標誤差 ≤ 0.01 を検証

## ディレクトリ構成
```
index.tsx             # Three.js シーンとゲームループ
index.html / .css     # UI テンプレートとスタイル
src/world/            # コアロジック（types, generator, mesher, input, HUD 等）
e2e/                  # Playwright スクリプト
.sdd/                 # 仕様・検証ドキュメント
public/               # 静的アセット
```

## 技術スタック
- **Three.js 0.128.0** — WebGL レンダリング
- **Vite + TypeScript** — 開発サーバーとバンドラ
- **Vitest** — ユニットテスト
- **Playwright** — ブラウザ E2E テスト

## 今後のアイデア
- TNT 用のパーティクル / サウンドエフェクト追加
- Chunk Manager と Three.js メッシュの統合による大規模ワールド化
- IndexedDB バックエンドによるより堅牢な永続化

スクリーンショットは `docs/screenshots/` を参照してください。
