<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Gnw4tIT23QCTDtfF01uqD8RKQkC25s0W

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Gameplay Controls
- Move: WASD / Jump: Space / Look: Mouse
- Sprint: Shift（速度×1.8）
- Place / Destroy: Right Click / Left Click（射程≤8）
- Hotbar: 1–5 で選択、またはマウスホイール。下部ホットバーの枠が選択中を強調

## Validation Hotkeys（開発時; Pointer Lock 取得後）
- T: 30秒FPSロガー + 自動移動ON
- Y: 自動移動のON/OFF
- U: 30秒FPSロガーのみ
- I: 設置/破壊ストレス（100回）。完了後、HUDに pass=true/false を表示
- 自動起動（URLパラメータ）: `/?autotest=1&secs=30`, `/?editstress=100`
- クイック起動: `npm run dev:auto`

## End-to-End Tests（Playwright）
```bash
npm install
npx playwright install chromium
npx playwright test
```
- `e2e/smoke.spec.ts`: ロック/HUD更新/設置・破壊/リサイズ/コンソール無エラー
- `e2e/editstress.spec.ts`: 設置・破壊100回の位置誤差 ≤ 0.01 を検証