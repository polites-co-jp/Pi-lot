# インフラ・環境構成 設計書

## 1. ホストOS

### 1.1 推奨OS

**Raspberry Pi OS Lite (64-bit)**

- GUIなし、軽量
- Node.js 直接実行（Docker不使用でメモリ節約）
- CIFS/SMBマウント標準対応
- 公式サポートで安定性が高い

### 1.2 初期セットアップ手順（概要）

```bash
# 1. OSアップデート
sudo apt update && sudo apt upgrade -y

# 2. Node.js 20 LTS インストール
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. CIFS ユーティリティ（SMBマウント用）
sudo apt install cifs-utils -y

# 4. rsync（バックアップ用）
sudo apt install rsync -y

# 5. PM2（プロセス管理・自動再起動）
sudo npm install -g pm2
```

## 2. SMBマウント設定

### 2.1 認証情報ファイル

```bash
# /etc/smb-credentials （パーミッション 600）
username=smbuser
password=smbpassword
domain=WORKGROUP
```

```bash
sudo chmod 600 /etc/smb-credentials
```

### 2.2 /etc/fstab

```
//192.168.1.111/share  /mnt/smb/nas1   cifs  credentials=/etc/smb-credentials,uid=1000,gid=1000,iocharset=utf8,vers=3.0,_netdev,nofail  0  0
//192.168.1.222/bk     /mnt/smb/bkup   cifs  credentials=/etc/smb-credentials,uid=1000,gid=1000,iocharset=utf8,vers=3.0,_netdev,nofail  0  0
```

**ポイント:**
- `_netdev`: ネットワーク接続後にマウント
- `nofail`: マウント失敗時もブート継続
- `vers=3.0`: SMB3を明示指定

### 2.3 マウントポイント作成

```bash
sudo mkdir -p /mnt/smb/nas1
sudo mkdir -p /mnt/smb/bkup
sudo mount -a
```

## 3. アプリケーション配置

### 3.1 ディレクトリ

```bash
# アプリケーション配置先
/opt/pi-lot/

# データディレクトリ（SQLite DBファイル）
/opt/pi-lot/data/pilot.db

# 設定ファイル
/opt/pi-lot/config/pilot.config.json
```

### 3.2 デプロイ

```bash
# リポジトリをクローン
cd /opt
sudo git clone <repository-url> pi-lot
sudo chown -R pi:pi pi-lot
cd pi-lot

# 依存関係インストール
npm ci

# フロントエンドビルド
npm run build -w packages/web

# サーバービルド
npm run build -w packages/server
```

### 3.3 PM2 によるプロセス管理

```bash
# 起動
pm2 start packages/server/dist/index.js --name pi-lot

# 自動起動設定（OS再起動時に復帰）
pm2 startup
pm2 save

# ステータス確認
pm2 status

# ログ確認
pm2 logs pi-lot

# 再起動
pm2 restart pi-lot
```

**PM2 を採用する理由:**
- クラッシュ時の自動再起動
- OS起動時の自動起動
- ログ管理（ローテーション対応）
- メモリ使用量のモニタリング
- Docker不要でメモリ節約（Pi 3 の 1GB RAM に対応）

## 4. 設定ファイル

### 4.1 config/pilot.config.json

```json
{
  "admin": {
    "username": "admin",
    "password": "初回セットアップ時に設定"
  },
  "jwt": {
    "secret": "ランダム生成される秘密鍵",
    "expires_in": "24h"
  },
  "discord": {
    "webhook_url": ""
  },
  "smb_mounts": [
    {
      "unc_path": "\\\\192.168.1.111\\share",
      "local_path": "/mnt/smb/nas1"
    },
    {
      "unc_path": "\\\\192.168.1.222\\bk",
      "local_path": "/mnt/smb/bkup"
    }
  ],
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  }
}
```

**注意:** このファイルは初回起動前にユーザーが編集する。
パスワードは平文保存せず、初回起動時にハッシュ化してDBに格納する方式も検討可。

## 5. ネットワーク構成例

```
                     Internet
                        │
                   [ルーター]
                        │
        ┌───────────────┼───────────────┐
        │               │               │
  ┌─────▼─────┐  ┌──────▼──────┐  ┌─────▼─────┐
  │ RaspberryPi│  │ NAS/PC      │  │ バックアップ│
  │ (Pi-lot)   │  │ .111        │  │ ストレージ  │
  │ .100:3000  │  │ SMB共有     │  │ .222       │
  └────────────┘  └─────────────┘  │ SMB共有     │
                                   └─────────────┘

  Pi-lot → .111 の共有フォルダを読み取り
  Pi-lot → .222 の共有フォルダへ書き込み
```

## 6. 運用

### 6.1 起動

```bash
cd /opt/pi-lot
pm2 start packages/server/dist/index.js --name pi-lot
```

### 6.2 停止

```bash
pm2 stop pi-lot
```

### 6.3 ログ確認

```bash
pm2 logs pi-lot
pm2 logs pi-lot --lines 100
```

### 6.4 アップデート

```bash
cd /opt/pi-lot
git pull
npm ci
npm run build -w packages/web
npm run build -w packages/server
pm2 restart pi-lot
```

## 7. メモリ使用量の見積もり（Pi 3: 1GB RAM）

| コンポーネント | 想定メモリ |
|---|---|
| Raspberry Pi OS Lite | ~150MB |
| Node.js (Fastify + SQLite) | ~80-150MB |
| PM2 | ~30MB |
| rsync（実行時のみ） | ~10-20MB |
| バッファ/キャッシュ | ~200MB |
| **合計** | **~470-550MB** |
| **空きメモリ** | **~450-530MB** |

Docker不使用 + SQLite により、Pi 3 (1GB) でも十分な余裕を確保。
