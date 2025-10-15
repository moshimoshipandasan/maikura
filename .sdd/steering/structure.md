# Project Structure

## ルートディレクトリ構成
```
/
├── index.html      # マークアップ（CDN で Three.js 読込）
├── index.tsx       # 実行ロジック（シーン/入力/当たり判定）
├── index.css       # スタイル
├── vite.config.ts  # 開発/ビルド設定（dev: 3000）
├── tsconfig.json   # TypeScript 設定
├── AGENTS.md       # コントリビュータガイド
├── README.md       # セットアップ手順
└── .sdd/           # SDD 関連ファイル
    ├── steering/   # ステアリングドキュメント（本ファイル群）
    ├── description.md
    └── ...
```

## コード構成パターン
- 単一エントリ `index.tsx` を基点に、将来的な拡張は `src/<feature>/` を作成し分割。
- 物理/入力/レンダリングは小さな純関数 or 小クラスで責務分離。

## ファイル命名規則
- TypeScript: `camelCase`（変数/関数）、`PascalCase`（クラス）
- テスト: `*.test.ts` を対象コードと同階層に配置（導入時）

## 主要な設計原則
- ブートストラップは最小限に保ち、機能はモジュールとして追加
- パフォーマンス重視（ピクセル比上限、マテリアル再利用、影の最適化）
- セキュアな配布（環境変数は `.env*`、秘密はコミットしない）

