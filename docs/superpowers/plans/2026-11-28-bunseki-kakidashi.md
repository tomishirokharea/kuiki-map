# 分析用に書き出す Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans（本人の指示で、聞かずに公開まで・使用量に注意 → Native で実装し、最後に独立した監査を1回）

**Goal:** 区域係が状況タブから、個人情報なしの集計と区域の決まりを1つの文字ファイルに書き出し、どの AI にも渡せるようにする
**Architecture:** 新しい `bunseki.js` が係の画面の上の帯にボタンを足し、既存の集計関数（KM・JG・help.js の説明）を呼んで文字を組み立てる。サーバーは変えない
**Tech Stack:** 素の JavaScript（既存と同じ）、試験は Playwright（tools/*.mjs と同じ形）
**Spec:** docs/superpowers/specs/2026-11-28-bunseki-kakidashi-design.md

## Global Constraints
- 名前・住所・家の位置・人の番号・注意の文・メモを出さない
- 既存の画面・数字・動作を変えない（足すのは窓口の1行ずつ）
- 版 2026.13.178（index.html の meta・app.js の APP_JS_VER・sw.js の APP_CACHE kuiki-app-v178）
- 変更の一覧は role:'admin'、news なし

## Review Focus
- 記録が0件・年齢データなし・区域が1つもない試作データ：エラーにせず「記録なし」と書く → B7
- 期間の境目（12か月前の月初より古い記録）を数えない → B3 で時間帯の表と一致
- iPhone で navigator.share が無い・断られた：保存にもどる（キャンセルは何もしない）→ 手で確認（自動試験は保存の道）
- 区域番号やキーの文字にカンマ・改行が入る：CSV の囲み → B8
- スペイン語の画面でも、書き出す中身は日本語のまま（AI 向け）でよいが、ボタン・画面は訳す → B6

---

### Task 1: 窓口を出す（schedule.js・joukyou-graph.js・help.js）
**Files:** Modify `schedule.js`（KM に slotAgg・SLB・SLC・awayRate・youngPct・opsLog を足す）、`joukyou-graph.js`（JGUI に inputs）、`help.js`（`window.KUIKI_HELP = HELP`）
- [ ] 既存の試験 `tools/henkou-ichiran-test.mjs` が合格のまま

### Task 2: bunseki.js と読み込み
**Files:** Create `bunseki.js`、Modify `index.html`（kimari.js の前に読む）、`i18n-es-joukyou.js`（画面の文の訳）
**Interfaces（Produces）:** `window.BUNSEKI = { text(months: 4|12): string, open(): void }`
- [ ] `tools/bunseki-test.mjs` を書く（B1〜B8）→ 失敗を確かめる
- [ ] 実装 → 合格
- [ ] コミット

### Task 3: 版と変更の一覧、回帰
**Files:** Modify `index.html`・`app.js`（CHANGELOG・APP_JS_VER）・`sw.js`
- [ ] bunseki-test・henkou-ichiran-test・状況まわりの既存試験が合格
- [ ] コミット → 独立監査 → 指摘の対応 → PR・マージ → Pages の確認
