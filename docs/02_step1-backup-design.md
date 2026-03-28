# Step 1: 定期バックアップ機能 設計書

## 1. 機能概要

SMB/Samba共有フォルダ間でファイルの定期バックアップを行う。
WEB管理画面からジョブの登録・編集・実行履歴の確認ができる。

## 2. バックアップジョブ仕様

### 2.1 ジョブ設定項目

| 項目 | 型 | 説明 | 例 |
|---|---|---|---|
| name | string | ジョブ名 | "NAS日次バックアップ" |
| source_path | string | コピー元パス（SMB共有） | `\\192.168.1.111\share\data` |
| dest_path | string | コピー先ベースパス（SMB共有） | `\\192.168.1.222\bk` |
| schedule | string | cron式 | `0 3 * * *`（毎日3時） |
| enabled | boolean | 有効/無効 | true |
| filter_mode | enum | `full` / `incremental` | `incremental` |
| retention | number | 保持世代数（0=無制限） | 5 |
| notify.on_start | boolean | 開始前にDiscord通知 | true |
| notify.on_error | boolean | エラー時にDiscord通知 | true |
| notify.on_success | boolean | 成功時にDiscord通知 | false |

### 2.2 実行フロー

```
[node-cron トリガー]
        │
        ▼
  ① job_executions レコード作成 (status: "running")
        │
        ▼
  ② notify.on_start == true → Discord通知
        │
        ▼
  ③ SMBマウント先の dest_path に YYYYMMDD-HHmmss フォルダ作成
     例: /mnt/smb/bk/20260328-030000/
        │
        ▼
  ④ filter_mode 判定
     ├─ "full"        → source 配下の全ファイルをコピー
     └─ "incremental" → 前回成功時の started_at 以降に
                         更新日時が新しいファイルのみコピー
        │
        ▼
  ⑤ コピー実行
     rsync コマンドを child_process.spawn で実行
     ※ SMBはホスト側でマウント済み前提のため、
       ローカルパスとしてコピー処理を実行
        │
        ▼
  ⑥ 世代管理
     dest_path 配下の日時フォルダを古い順にリスト
     retention を超えた分を削除
        │
        ▼
  ⑦ job_executions レコード更新
     成功 → status: "success", files_copied, total_size 記録
     失敗 → status: "failed", error_message 記録
        │
        ▼
  ⑧ 通知判定
     ├─ 成功 & notify.on_success → Discord通知
     └─ 失敗 & notify.on_error  → Discord通知
```

### 2.3 SMBマウント戦略

RaspberryPi (Linux) 上で動作するため、SMBマウントをホスト側で事前に行う。

```bash
# /etc/fstab の例
//192.168.1.111/share  /mnt/smb/source  cifs  credentials=/etc/smb-credentials,uid=1000,gid=1000,iocharset=utf8  0  0
//192.168.1.222/bk     /mnt/smb/dest    cifs  credentials=/etc/smb-credentials,uid=1000,gid=1000,iocharset=utf8  0  0
```

アプリ設定では UNCパス → ローカルマウントパスのマッピングを管理する。

#### マッピングテーブル（config）

```json
{
  "smb_mounts": [
    {
      "unc_path": "\\\\192.168.1.111\\share",
      "local_path": "/mnt/smb/source"
    },
    {
      "unc_path": "\\\\192.168.1.222\\bk",
      "local_path": "/mnt/smb/dest"
    }
  ]
}
```

ジョブ登録時はユーザーがUNCパスで入力 → 実行時にローカルパスへ変換して処理。

### 2.4 コピーコマンド

Linux環境（RaspberryPi）では `rsync` を使用。

```bash
# フルコピー
rsync -av --progress /mnt/smb/source/data/ /mnt/smb/dest/20260328-030000/

# 差分コピー（前回実行時刻以降に更新されたもの）
rsync -av --newer-mtime="2026-03-27T03:00:00" /mnt/smb/source/data/ /mnt/smb/dest/20260328-030000/
```

※ rsync は `child_process.spawn` で実行し、stdout/stderr をリアルタイムで記録する。

### 2.5 世代管理

```
dest_path/
├── 20260325-030000/  ← retention=5 の場合、6回目実行時に削除
├── 20260326-030000/
├── 20260327-030000/
├── 20260328-030000/
├── 20260329-030000/
└── 20260330-030000/  ← 最新（6回目）
```

- dest_path 配下のフォルダ名を日時順にソート
- `総数 - retention` 個の古いフォルダを `rm -rf` で削除
- retention = 0 の場合は削除しない（無制限保持）

## 3. データモデル（SQLite）

### 3.1 backup_jobs テーブル

```sql
CREATE TABLE backup_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  source_path   TEXT    NOT NULL,                    -- UNCパス
  dest_path     TEXT    NOT NULL,                    -- UNCパス
  schedule      TEXT    NOT NULL,                    -- cron式
  enabled       INTEGER NOT NULL DEFAULT 1,          -- 0=無効, 1=有効
  filter_mode   TEXT    NOT NULL DEFAULT 'full',     -- 'full' | 'incremental'
  retention     INTEGER NOT NULL DEFAULT 0,          -- 世代数 (0=無制限)
  notify_on_start   INTEGER NOT NULL DEFAULT 0,      -- 0=OFF, 1=ON
  notify_on_error   INTEGER NOT NULL DEFAULT 1,
  notify_on_success INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

### 3.2 job_executions テーブル

```sql
CREATE TABLE job_executions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        INTEGER NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
  status        TEXT    NOT NULL DEFAULT 'running',  -- 'running' | 'success' | 'failed'
  folder_name   TEXT    NOT NULL,                    -- '20260328-030000'
  files_copied  INTEGER NOT NULL DEFAULT 0,
  total_size    TEXT    NOT NULL DEFAULT '0B',
  error_message TEXT,
  started_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT
);

CREATE INDEX idx_executions_job    ON job_executions(job_id);
CREATE INDEX idx_executions_status ON job_executions(status);
CREATE INDEX idx_executions_start  ON job_executions(started_at);
```

## 4. API設計

### 4.1 認証

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/api/auth/login` | ログイン → JWTトークン発行 |

**Request:**
```json
{
  "username": "admin",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

※ 以降の全APIは `Authorization: Bearer <token>` ヘッダー必須。

### 4.2 バックアップジョブ

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/jobs` | ジョブ一覧取得 |
| GET | `/api/jobs/:id` | ジョブ詳細取得 |
| POST | `/api/jobs` | ジョブ新規作成 |
| PUT | `/api/jobs/:id` | ジョブ更新 |
| DELETE | `/api/jobs/:id` | ジョブ削除 |
| POST | `/api/jobs/:id/run` | ジョブ即時実行 |

#### POST `/api/jobs` Request

```json
{
  "name": "NAS日次バックアップ",
  "source_path": "\\\\192.168.1.111\\share\\data",
  "dest_path": "\\\\192.168.1.222\\bk",
  "schedule": "0 3 * * *",
  "enabled": true,
  "filter_mode": "incremental",
  "retention": 5,
  "notify": {
    "on_start": true,
    "on_error": true,
    "on_success": false
  }
}
```

#### GET `/api/jobs` Response

```json
{
  "data": [
    {
      "id": 1,
      "name": "NAS日次バックアップ",
      "source_path": "\\\\192.168.1.111\\share\\data",
      "dest_path": "\\\\192.168.1.222\\bk",
      "schedule": "0 3 * * *",
      "enabled": true,
      "filter_mode": "incremental",
      "retention": 5,
      "notify": {
        "on_start": true,
        "on_error": true,
        "on_success": false
      },
      "last_execution": {
        "status": "success",
        "finished_at": "2026-03-28T03:05:23Z"
      },
      "created_at": "2026-03-01T10:00:00Z",
      "updated_at": "2026-03-15T14:30:00Z"
    }
  ]
}
```

### 4.3 実行履歴

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/jobs/:id/executions` | 指定ジョブの実行履歴 |
| GET | `/api/executions/:id` | 実行詳細（ログ含む） |

#### GET `/api/jobs/:id/executions` Response

```json
{
  "data": [
    {
      "id": 1,
      "job_id": 1,
      "status": "success",
      "folder_name": "20260328-030000",
      "files_copied": 142,
      "total_size": "1.2GB",
      "error_message": null,
      "started_at": "2026-03-28T03:00:00Z",
      "finished_at": "2026-03-28T03:05:23Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 45
  }
}
```

### 4.4 設定

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/config/smb-mounts` | SMBマウントマッピング一覧 |
| PUT | `/api/config/smb-mounts` | SMBマウントマッピング更新 |
| GET | `/api/config/discord` | Discord Webhook設定取得 |
| PUT | `/api/config/discord` | Discord Webhook設定更新 |

## 5. WEB画面設計

### 5.1 画面一覧

| 画面 | パス | 説明 |
|---|---|---|
| ログイン | `/login` | ID/PW入力 |
| ダッシュボード | `/` | ジョブ一覧 + 最新実行状態サマリ |
| ジョブ登録/編集 | `/jobs/new`, `/jobs/:id/edit` | ジョブ設定フォーム |
| 実行履歴 | `/jobs/:id/history` | ジョブの実行結果リスト |
| 実行詳細 | `/executions/:id` | 1回分の実行詳細・ログ |
| 設定 | `/settings` | SMBマウント設定・Discord設定 |

### 5.2 ダッシュボード画面

```
┌─────────────────────────────────────────────────────────┐
│  Pi-lot                                    [⚙ 設定]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  バックアップジョブ                      [+ 新規登録]     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🟢 NAS日次バックアップ          毎日 03:00      │    │
│  │    \\192.168.1.111\share → \\192.168.1.222\bk   │    │
│  │    最終実行: 2026/03/28 03:05 成功 (142件)      │    │
│  │                         [履歴] [実行] [編集]     │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🔴 開発サーバーバックアップ      毎週月 02:00    │    │
│  │    \\192.168.1.50\dev → \\192.168.1.222\bk      │    │
│  │    最終実行: 2026/03/24 02:10 失敗              │    │
│  │                         [履歴] [実行] [編集]     │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 5.3 ジョブ登録/編集画面

```
┌─────────────────────────────────────────────────────────┐
│  ← 戻る        ジョブ登録                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ジョブ名        [NAS日次バックアップ              ]     │
│                                                         │
│  コピー元(UNC)   [\\192.168.1.111\share\data       ]     │
│  コピー先(UNC)   [\\192.168.1.222\bk               ]     │
│                                                         │
│  スケジュール    [0 3 * * *                        ]     │
│                  ↳ 「毎日 03:00」  ← 自然言語プレビュー  │
│                                                         │
│  ─── オプション ──────────────────────────────────       │
│                                                         │
│  コピー方式      ○ 全ファイルコピー                      │
│                  ● 差分コピー（前回実行以降の更新分）      │
│                                                         │
│  保持世代数      [5      ]  ※ 0 = 無制限                │
│                                                         │
│  ─── Discord通知 ────────────────────────────────       │
│                                                         │
│  ☑ 開始前に通知                                         │
│  ☑ エラー時に通知                                       │
│  ☐ 成功時に通知                                         │
│                                                         │
│  有効            [ON/OFF トグル]                         │
│                                                         │
│                             [キャンセル]  [保存]         │
└─────────────────────────────────────────────────────────┘
```

### 5.4 実行履歴画面

```
┌─────────────────────────────────────────────────────────┐
│  ← 戻る     NAS日次バックアップ - 実行履歴              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  日時                 状態     件数    サイズ            │
│  ─────────────────────────────────────────────          │
│  2026/03/28 03:00    🟢成功   142件   1.2GB   [詳細]    │
│  2026/03/27 03:00    🟢成功   38件    256MB   [詳細]    │
│  2026/03/26 03:00    🔴失敗   -       -       [詳細]    │
│  2026/03/25 03:00    🟢成功   201件   3.1GB   [詳細]    │
│  2026/03/24 03:00    🟢成功   15件    89MB    [詳細]    │
│                                                         │
│                    [< 前へ]  1/9  [次へ >]               │
└─────────────────────────────────────────────────────────┘
```

## 6. Discord通知

### 6.1 Webhook形式

Discord Webhook URLに対してPOSTリクエストを送信。

### 6.2 通知メッセージ例

**開始通知:**
```
📦 バックアップ開始
ジョブ: NAS日次バックアップ
時刻: 2026/03/28 03:00:00
```

**成功通知:**
```
✅ バックアップ完了
ジョブ: NAS日次バックアップ
時刻: 2026/03/28 03:00:00 → 03:05:23
件数: 142ファイル / 1.2GB
```

**エラー通知:**
```
❌ バックアップ失敗
ジョブ: NAS日次バックアップ
時刻: 2026/03/28 03:00:00
エラー: rsync: connection refused (111)
```
