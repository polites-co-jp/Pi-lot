# Pi-lot 開発ガイド

## プロジェクト概要

Raspberry Pi 3 (1GB RAM) で動作する LAN 内マシン管理ツール。
定期バックアップ、マシン監視、リモート操作を WEB 画面から一元管理する。

## 技術スタック

- **ランタイム**: Node.js 24 LTS（直接実行、Docker不使用）
- **API**: Fastify + TypeScript
- **フロント**: React + Vite + Tailwind CSS + shadcn/ui
- **DB**: SQLite (better-sqlite3)
- **スケジューラ**: node-cron
- **プロセス管理**: PM2
- **通知**: Discord Webhook (fetch)

## アーキテクチャ上の制約

### メモリ制約 (Pi 3: 1GB RAM)
- Docker は使わない。Node.js を直接実行し PM2 で管理する
- DB は SQLite (better-sqlite3) を組み込みで使用する。外部DBプロセスは起動しない
- 不要な依存ライブラリを増やさない。メモリフットプリントを常に意識すること

### モノレポ構成 (npm workspaces)
- `packages/server/` — Fastify API + バッチエンジン
- `packages/web/` — React SPA
- ビルド済みフロントエンドは Fastify から静的配信する

## 実装ルール

### DB (SQLite)
- `better-sqlite3` を使用する（非同期ラッパーではなく同期API）
- DB ファイルは `data/pilot.db` に配置する
- テーブル定義は `packages/server/src/db/` にマイグレーションとして管理する
- 日時は UTC の ISO 8601 文字列で格納する（SQLite に native datetime 型はない）

### バックアップ実行
- rsync を `child_process.spawn` で呼び出す。Node.js のファイルコピーは使わない
- UNC パス (`\\host\share`) はユーザー入力用。実行時は `config/pilot.config.json` の `smb_mounts` マッピングでローカルパス (`/mnt/smb/...`) に変換する
- コピー先に `YYYYMMDD-HHmmss` フォルダを作成してからコピーする
- 世代管理: `retention` 数を超えた古いフォルダを削除する。`retention=0` は無制限
- 差分モード (`incremental`): 前回成功時の `started_at` を基準に `rsync --newer-mtime` で絞り込む

### 認証
- 管理者は 1 人のみ。Users テーブルは作らない
- 認証情報は `config/pilot.config.json` で定義する
- JWT (jsonwebtoken) でセッション管理する

### Discord 通知
- ジョブごとに `notify_on_start` / `notify_on_error` / `notify_on_success` を個別設定できる
- Webhook URL は `config/pilot.config.json` の `discord.webhook_url` を使う
- 通知は fetch で直接 POST する。discord.js は使わない

### フロントエンド
- スマホ対応（レスポンシブ）は必須
- Tailwind CSS + shadcn/ui を使う
- cron 式入力時に自然言語プレビューを表示する

## 設定ファイル

`config/pilot.config.json` に以下を格納する:
- `admin` — ユーザー名・パスワード
- `jwt` — secret, expires_in
- `discord` — webhook_url
- `smb_mounts` — UNC パス ↔ ローカルパスのマッピング配列
- `server` — port, host

## デプロイ先

- Raspberry Pi OS Lite (64-bit)
- SMB 共有フォルダはホスト側で `/mnt/smb/` 配下にマウント済みの前提
- `/opt/pi-lot/` にアプリケーションを配置する

## 設計書

詳細な仕様は `docs/` を参照:
- `docs/01_system-overview.md` — 全体設計
- `docs/02_step1-backup-design.md` — Step1 バックアップ・ファイル振り分け機能の詳細（API・DB・画面）
- `docs/03_infrastructure.md` — インフラ・環境構成


## git

- コミュニケーション時にファイル修正が発生した場合は、その内容をコミット、pushする。
  - コミットメッセージは、変更内容に合うものを日本語で記載する。
- プロンプト内に開始時に、指示があった場合はfeature/[作業名]となるフィーチャブランチを作成する
  - ユーザ指示があった場合、featureブランチの派生元にマージしてpushする