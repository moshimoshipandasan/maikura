# Technology Stack

## アーキテクチャ
フロントエンド単体の SPA。Vite で開発/ビルドし、Three.js を CDN から読み込み。アプリ実行ロジックは `index.tsx` に集約。

## 使用技術
### 言語とフレームワーク
- TypeScript: ~5.8
- Vite: ^6（開発/ビルド/プレビュー）
- Three.js: r128（CDN, `index.html` で読み込み）

### 依存関係（主要）
- 開発: `typescript`, `vite`, `@types/node`, `vitest`
- 実行時: なし（Three.js は CDN 依存）

### テスト
- フレームワーク: Vitest ^1.6（ユニット: `src/world/*.test.ts`）

## 開発環境
### 必要なツール
- Node.js（推奨: LTS） / npm

### よく使うコマンド
- 起動: `npm run dev`（デフォルト `http://localhost:3000`）
- ビルド: `npm run build`（出力 `dist/`）
- プレビュー: `npm run preview`
- 型チェック: `npx tsc --noEmit`
 - テスト: `npm run test` / 監視: `npm run test:watch`

## 環境変数
- `GEMINI_API_KEY`: Vite の `define` で `process.env.API_KEY` / `process.env.GEMINI_API_KEY` にマップ。`.env.local` 等に設定（値はコミットしない）。

## ビルド/開発設定の補足
- サーバー: `host: 0.0.0.0`, `port: 3000`
- モジュール解決: エイリアス `@ -> プロジェクトルート`

