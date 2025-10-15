# Project Structure

## ルートディレクトリ構成
```
/
├── index.html       # マークアップ（CDNでThree.js読込）
├── index.tsx        # 実行ロジック（シーン/入力/当たり判定/UI）
├── index.css        # スタイル
├── src/
│   └── world/
│       ├── generator.ts            # 手続き地形生成
│       ├── mesher.ts               # メッシュ登録/統計
│       ├── renderer.ts             # 描画統計・DPR制限
│       ├── input.ts                # 入力→移動ベクトル
│       ├── hud.ts                  # FPS/座標フォーマット
│       ├── types.ts                # ワールド定義・定数
│       ├── *.worker.ts             # ワーカー（将来の並列化）
│       └── *.test.ts               # 各モジュールのユニットテスト
├── vite.config.ts   # 開発/ビルド設定（dev: 3000, alias:@）
├── tsconfig.json    # TypeScript 設定
├── AGENTS.md        # コントリビュータガイド
├── README.md        # セットアップ手順
├── .sdd/
│   └── steering/    # ステアリングドキュメント
└── dist/            # ビルド出力（`npm run build`）
```

## コード構成パターン
- 単一エントリ `index.tsx` を基点に、将来的な拡張は `src/<feature>/` を作成し分割。
- 物理/入力/レンダリングは小さな純関数 or 小クラスで責務分離。

## ファイル命名規則
- TypeScript: `camelCase`（変数/関数）、`PascalCase`（クラス）
- テスト: `*.test.ts` を対象コードと同階層に配置（本リポジトリでは `src/world/*.test.ts` に実装済み）

## 主要な設計原則
- ブートストラップは最小限に保ち、機能はモジュールとして追加
- パフォーマンス重視（ピクセル比上限、マテリアル再利用、影の最適化）
- セキュアな配布（環境変数は `.env*`、秘密はコミットしない）

