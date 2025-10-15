# Technology Stack

## アーキテクチャ
フロントエンド単体の SPA。Vite で開発/ビルドし、Three.js を CDN から読み込み。アプリ実行ロジックは `index.tsx` に集約。

## 使用技術
### 言語とフレームワーク
- TypeScript: ~5.8
- Vite: ^6（開発/ビルド/プレビュー）
- Three.js: r128（CDN, `index.html` で読み込み）

### 依存関係（主要）
- 開発: `typescript`, `vite`, `@types/node`
- 実行時: なし（Three.js は CDN 依存）

## 開発環境
### 必要なツール
- Node.js（推奨: LTS） / npm

### よく使うコマンド
- 起動: `npm run dev`（デフォルト `http://localhost:3000`）
- ビルド: `npm run build`（出力 `dist/`）
- プレビュー: `npm run preview`
- 型チェック: `npx tsc --noEmit`

## 環境変数
- `GEMINI_API_KEY`: Vite 定義経由で参照。`.env.local` 等に設定（値はリポジトリに含めない）。

