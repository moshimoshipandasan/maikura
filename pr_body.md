## 概要
Minecraft風の操作体験を強化する以下を追加し、E2Eで基本動作と受入基準（設置/破壊100回の誤差≤0.01）を自動検証しました。

## 変更点（主な項目）
- UI: 画面下部にホットバー（1–5/ホイール切替、選択強調）
- Gameplay: Shiftスプリント（速度×1.8）、複数ブロック（Grass/Dirt/Stone/Sand/Wood）
- 永続化: localStorageへ設置/破壊を保存し、起動時に反映
- Validation: 半自動スモーク（T/Y/U/I）と URL パラメータ（autotest/editstress）
- E2E: Playwright で smoke/editstress を追加（previewサーバ自動起動）

## 影響ファイル
- index.html / index.css / index.tsx
- src/world/validation.ts, playwright.config.ts, e2e/*
- package.json（@playwright/test 追加、dev:auto 追加）
- .sdd 配下ドキュメント（検証手順追記）

## 動作確認
```sh
npm install
npx playwright install chromium
npm run test              # 12 files / 26 tests passed（Vitest）
npx playwright test       # smoke + editstress の2件が PASS
npm run dev               # 手動スモーク（Pointer Lock 取得→設置/破壊等）
```

## 受入基準
- 設置/破壊100回の位置誤差 |Δ| ≤ 0.01: E2Eで pass=true を確認済み
- FPS（FHD・DPR≤2・平均≥60/最小≥30）: 環境依存のため VALIDATION.md の手順で計測・記録をお願いします

## リスク/互換性
- 既存の index.tsx に最小限の追記（材質追加・入力・保存/復元）
- Three.js のCDN版バージョンは据え置き

ご確認よろしくお願いします。