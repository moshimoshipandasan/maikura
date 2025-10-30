# ブロックワールド（Vite + Three.js）

Procedural に地形を生成し、WASD で歩き回れるサンドボックス型 3D ゲームです。ブロックの設置/破壊や HUD 表示、Pointer Lock を活かした没入感ある操作を備えています。

- エントリーポイント: `index.tsx`
- ソース: `src/`（ゲームロジックは `src/world/` 以下）
- テスト: 各モジュール横に `*.test.ts`
- アセット: `public/`
- Vite エイリアス: `@` → プロジェクトルート

## 主な機能
- 16×16×128 チャンク構造の Procedural 地形生成（草原/砂/雪 などのバイオーム）
- ブロック設置/破壊とホットバー UI
- FPS / 座標表示 HUD とオートテスト向けオーバーレイ
- TNT ブロックの連鎖爆発演出（Obsidian は耐爆仕様）
- Pointer Lock + WASD/Space/Shift による移動、`E` でインベントリ操作

## セットアップ
事前条件: Node.js（LTS 系推奨）

```bash
npm install
cp .env.local.example .env.local   # 必要なら API キーなどを設定
npm run dev                        # http://localhost:3000 で開発サーバー起動
```

### 利用できるスクリプト
- `npm run dev` : Vite 開発サーバー（HMR 付き）
- `npm run build` : 最適化ビルドを `dist/` に出力
- `npm run preview` : `dist/` をローカル配信（Pointer Lock の動作確認用）
- `npx tsc --noEmit` : 型チェックのみを実行
- `npm run test` / `npm run test:watch` : Vitest によるユニットテスト
- `npx playwright test` : E2E テスト（Chromium などのインストールが必要）

## 操作方法
- `W` `A` `S` `D` : 移動
- `Space` : ジャンプ
- `Shift` : スプリント
- マウス左/右クリック : ブロック破壊 / 設置
- `E` : インベントリ（ホットバー）とインタラクション
- `M` または `Esc` : Pointer Lock の解除

## テスト
- `npm run test` でユニットテストを実行（Vitest）
- `npx playwright test` で E2E テスト（Pointer Lock、HUD、設置/破壊など）を検証

## コントリビュート歓迎
MIT ライセンスのもとで開発しています。バグ修正や機能追加のプルリクエストを歓迎します。PR の際は以下をご確認ください。

1. `npm run test` など関連するテストを実行し、結果を明記してください。
2. UI に影響する場合はスクリーンショットや動画を添付してください。
3. Conventional Commits（例: `feat:`, `fix:`）のスタイルでコミットメッセージをまとめてください。

## ライセンス
MIT License
