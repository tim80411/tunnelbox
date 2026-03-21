# Project Conventions

## Spec 檔案位置
- 所有 spec 檔案統一放在 `.project/specs/` 目錄下

## 版本升版
- 每次升版必須使用 `scripts/bump-version.sh` 腳本
- 用法：`./scripts/bump-version.sh [major|minor|patch]`（預設 patch）
- 腳本會自動完成：更新 package.json、commit、建立 git tag、push 並觸發 GitHub Actions 建置 release
