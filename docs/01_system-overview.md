# Pi-lot システム概要設計書

## 1. プロジェクト概要

Pi-lot は Raspberry Pi を活用した LAN 内マシン管理の総合パッケージです。
定期バックアップ、マシン監視、リモート操作などの運用タスクを一元管理します。

## 2. システム構成

### 2.1 全体アーキテクチャ

```
┌─ Raspberry Pi 3 ──────────────────────────────────────────┐
│                                                            │
│  ┌──────────────────────────────────────────────┐          │
│  │           pi-lot (Node.js プロセス)           │          │
│  │                                              │          │
│  │  ┌─────────┐  ┌──────┐  ┌───────────┐       │          │
│  │  │ Fastify  │  │ React│  │ node-cron │       │          │
│  │  │ API      │  │ SPA  │  │ バッチ     │       │          │
│  │  │          │  │(静的) │  │           │       │          │
│  │  └────┬─────┘  └──────┘  └─────┬─────┘       │          │
│  │       │                        │              │          │
│  │       └──────┬─────────────────┘              │          │
│  │              │ better-sqlite3 (組み込み)       │          │
│  │       ┌──────▼──────┐                         │          │
│  │       │   SQLite    │                         │          │
│  │       │  pilot.db   │                         │          │
│  │       └─────────────┘                         │          │
│  └──────────────────────────────────────────────┘          │
│                                                            │
│  /mnt/smb/  ← SMB共有フォルダのマウントポイント               │
│                                                            │
└────────────────────────────────────────────────────────────┘
         │                          │
    SMB/CIFS                   HTTPS/Ping
         │                          │
   ┌─────▼─────┐             ┌──────▼──────┐
   │ LAN内      │             │ WAN側       │
   │ マシン群    │             │ サーバー群   │
   └───────────┘             └─────────────┘
```

### 2.2 技術スタック

| レイヤー | 技術 | 備考 |
|---|---|---|
| フロントエンド | React + Vite | SPA構成 |
| UIフレームワーク | Tailwind CSS + shadcn/ui | レスポンシブ対応 |
| APIサーバー | Fastify | 軽量・高速 |
| 認証 | JWT (jsonwebtoken) | 管理者1名固定 |
| スケジューラ | node-cron | cron式でジョブ実行 |
| DB | SQLite (better-sqlite3) | 組み込み・軽量・Pi 3向き |
| 通知 | Discord Webhook | fetch による直接呼び出し |
| 実行環境 | Node.js 直接実行 | Docker不使用（メモリ節約） |
| ホストOS | Raspberry Pi OS Lite (64-bit) | GUI不要 |

### 2.3 ディレクトリ構成（予定）

```
Pi-lot/
├── docs/                        # 設計書
├── config/
│   └── pilot.config.json        # 管理者認証情報・Discord設定等
├── packages/
│   ├── server/                  # Fastify APIサーバー + バッチエンジン
│   │   ├── src/
│   │   │   ├── api/             # APIルート定義
│   │   │   ├── batch/           # バッチ処理（バックアップ実行等）
│   │   │   ├── db/              # SQLite接続・クエリ
│   │   │   ├── notify/          # Discord通知
│   │   │   ├── scheduler/       # node-cron スケジューラ
│   │   │   └── index.ts         # エントリーポイント
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                     # React SPA
│       ├── src/
│       │   ├── components/      # UIコンポーネント
│       │   ├── pages/           # ページ
│       │   ├── hooks/           # カスタムフック
│       │   ├── api/             # API呼び出し
│       │   └── main.tsx
│       ├── package.json
│       └── vite.config.ts
├── data/                        # SQLite データファイル
│   └── pilot.db
└── package.json                 # ルート (npm workspaces)
```

## 3. 動作環境

### 3.1 ハードウェア要件

| 項目 | 最低 | 推奨 |
|---|---|---|
| 本体 | Raspberry Pi 3 Model B (1GB) | Raspberry Pi 4 Model B (4GB) |
| ストレージ | microSD 16GB 以上 | microSD 32GB 以上 + 外付けHDD/SSD |
| ネットワーク | 有線LAN | 有線LAN |

### 3.2 ホストOS セットアップ前提

- Raspberry Pi OS Lite (64-bit)
- Node.js 20 LTS インストール済み
- rsync インストール済み
- SMB共有フォルダをマウント済み（/mnt/smb/ 配下）

## 4. 開発ステップ

| Step | 内容 | 状態 |
|---|---|---|
| Step 1 | 定期バックアップ・ファイル振り分け登録 + 結果確認WEB画面 | **← 今ここ** |
| Step 2 | LAN/WAN マシン死活監視 + ダッシュボード | 未着手 |
| Step 3 | リモートコマンド実行 | 未着手 |
| Step 4 | その他拡張機能 | 未着手 |
