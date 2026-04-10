# Pi-lot 設置手順書

Raspberry Pi OS Lite インストール直後の RaspberryPi に対して、Pi-lot を動作させるまでの手順を記載する。

## 前提条件

- Raspberry Pi 3 Model B 以上
- Raspberry Pi OS Lite (64-bit) をインストール済み
- SSH 接続が可能な状態（Imager で SSH 有効化済み、またはモニタ＋キーボードでローカル操作）
- RaspberryPi が LAN に有線接続されている
- バックアップ元・バックアップ先の SMB 共有フォルダが LAN 内に存在する

## 1. OS の初期セットアップ

### 1.1 SSH 接続

```bash
ssh pi@<RaspberryPiのIPアドレス>
```

※ Raspberry Pi Imager でユーザー名・パスワードを設定済みの場合はそれを使用する。

### 1.2 OS アップデート

```bash
sudo apt update && sudo apt upgrade -y
```

### 1.3 タイムゾーンの設定

```bash
sudo timedatectl set-timezone Asia/Tokyo
```

確認:

```bash
timedatectl
```

### 1.4 ホスト名の変更（任意）

```bash
sudo hostnamectl set-hostname pi-lot
```

変更後、再起動するか `/etc/hosts` の `127.0.1.1` 行も更新する。

## 2. 必要パッケージのインストール

### 2.1 rsync（バックアップ実行に必要）

```bash
sudo apt install rsync -y
```

### 2.2 CIFS ユーティリティ（SMB マウントに必要）

```bash
sudo apt install cifs-utils -y
```

### 2.3 Git（デプロイに必要）

```bash
sudo apt install git -y
```

### 2.4 Node.js 24 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

インストール確認:

```bash
node -v   # v24.x.x
npm -v    # 10.x.x
```

### 2.5 PM2（プロセス管理）

```bash
sudo npm install -g pm2
```

## 3. SMB 共有フォルダのマウント

### 3.1 SMB 認証情報ファイルの作成

```bash
sudo nano /etc/smb-credentials
```

内容:

```
username=<SMBユーザー名>
password=<SMBパスワード>
domain=WORKGROUP
```

パーミッションを制限:

```bash
sudo chmod 600 /etc/smb-credentials
```

### 3.2 マウントポイントの作成

バックアップ元・バックアップ先それぞれのマウントポイントを作成する。
以下は一例。実際の環境に合わせて変更すること。

```bash
sudo mkdir -p /mnt/smb/nas1
sudo mkdir -p /mnt/smb/bkup
```

### 3.3 /etc/fstab への追記

```bash
sudo nano /etc/fstab
```

以下を末尾に追記する（IPアドレス・共有名は環境に合わせて変更）:

```
//192.168.1.111/share  /mnt/smb/nas1  cifs  credentials=/etc/smb-credentials,uid=1000,gid=1000,iocharset=utf8,vers=3.0,_netdev,nofail  0  0
//192.168.1.222/bk     /mnt/smb/bkup  cifs  credentials=/etc/smb-credentials,uid=1000,gid=1000,iocharset=utf8,vers=3.0,_netdev,nofail  0  0
```

**オプションの説明:**

| オプション | 意味 |
|---|---|
| `credentials` | 認証情報ファイルのパス |
| `uid=1000,gid=1000` | マウントしたファイルの所有者（pi ユーザー） |
| `iocharset=utf8` | 日本語ファイル名対応 |
| `vers=3.0` | SMB プロトコルバージョン |
| `_netdev` | ネットワーク接続後にマウント |
| `nofail` | マウント失敗時もブート継続 |

### 3.4 マウント実行と確認

```bash
sudo mount -a
```

マウントされていることを確認:

```bash
df -h | grep smb
ls /mnt/smb/nas1/
ls /mnt/smb/bkup/
```

エラーが出る場合は IP アドレス・共有名・認証情報を確認すること。

## 4. Pi-lot アプリケーションのデプロイ

### 4.1 アプリケーションの配置

```bash
cd /opt
sudo git clone https://github.com/polites-co-jp/Pi-lot.git pi-lot
sudo chown -R pi:pi /opt/pi-lot
cd /opt/pi-lot
```

### 4.2 依存関係のインストール

**重要: 必ず Raspberry Pi 上で `npm install` を実行すること。**
開発マシン（Windows/Mac）で生成した `package-lock.json` をそのままコピーすると、プラットフォーム固有の依存（`@rollup/rollup-linux-arm64-gnu` 等）が含まれず、ビルド時にエラーになる。

```bash
npm install
```

※ `better-sqlite3` のネイティブビルドが実行される。Raspberry Pi OS Lite にはビルドツール（gcc, make 等）がプリインストールされているため通常は成功する。
万一失敗した場合:

```bash
sudo apt install build-essential python3 -y
npm install
```

### 4.3 フロントエンドのビルド

```bash
npm run build -w apps/web
```

ビルドが `@rollup/rollup-linux-arm64-gnu` のエラーで失敗する場合は、`node_modules` と `package-lock.json` を削除して再インストールする:

```bash
rm -rf node_modules package-lock.json
npm install
npm run build -w apps/web
```

### 4.4 サーバーのビルド

```bash
npm run build -w apps/server
```

## 5. 設定ファイルの作成

### 5.1 設定ファイルのコピー

```bash
cd /opt/pi-lotkou
cp config/pilot.config.example.json config/pilot.config.json
```

### 5.2 設定ファイルの編集

```bash
nano config/pilot.config.json
```

以下の項目を環境に合わせて変更する:

```json
{
  "admin": {
    "username": "admin",
    "password": "安全なパスワードに変更"
  },
  "jwt": {
    "secret": "ランダムな文字列に変更（例: openssl rand -hex 32 で生成）",
    "expires_in": "24h"
  },
  "discord": {
    "webhook_url": "Discord Webhook URLを設定（不要なら空文字のまま）"
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

**必ず変更する項目:**

| 項目 | 説明 |
|---|---|
| `admin.password` | 管理画面のログインパスワード |
| `jwt.secret` | JWT 署名用の秘密鍵（ランダム文字列） |
| `smb_mounts` | 手順3で設定した UNC パスとローカルパスの対応 |

JWT シークレットの生成例:

```bash
openssl rand -hex 32
```

## 6. データディレクトリの作成

```bash
mkdir -p /opt/pi-lot/data
```

※ 初回起動時に SQLite データベース (`data/pilot.db`) が自動作成される。

## 7. PM2 による起動と自動起動設定

### 7.1 アプリケーションの起動

```bash
cd /opt/pi-lot
pm2 start apps/server/dist/index.js --name pi-lot
```

### 7.2 動作確認

```bash
pm2 status
pm2 logs pi-lot --lines 20
```

ブラウザから `http://<RaspberryPiのIPアドレス>:3000` にアクセスし、ログイン画面が表示されることを確認する。

### 7.3 OS 起動時の自動起動設定

```bash
pm2 startup
```

表示されたコマンド（`sudo env PATH=...` で始まる行）をそのまま実行する。

```bash
pm2 save
```

### 7.4 再起動テスト

```bash
sudo reboot
```

再起動後に SSH 接続し、Pi-lot が自動起動していることを確認:

```bash
pm2 status
```

## 8. 動作確認チェックリスト

以下をすべて確認して設置完了とする。

- [ ] `http://<IP>:3000` でログイン画面が表示される
- [ ] 設定したユーザー名・パスワードでログインできる
- [ ] ダッシュボード画面が表示される
- [ ] ジョブの新規登録ができる
- [ ] 登録したジョブの即時実行が成功する（実行履歴に `成功` と表示される）
- [ ] SMB マウント先にバックアップフォルダ（YYYYMMDD-HHmmss）が作成されている
- [ ] OS 再起動後も Pi-lot が自動起動する
- [ ] Discord Webhook を設定している場合、通知が届く

## 9. トラブルシューティング

### Pi-lot が起動しない

```bash
pm2 logs pi-lot --lines 50
```

よくある原因:
- `config/pilot.config.json` が存在しない → 手順5を確認
- JSON の構文エラー → `node -e "JSON.parse(require('fs').readFileSync('config/pilot.config.json'))"` で検証
- ポートが既に使用されている → `sudo lsof -i :3000`

### SMB マウントが失敗する

```bash
sudo mount -a
dmesg | tail -20
```

よくある原因:
- 認証情報が間違っている → `/etc/smb-credentials` を確認
- SMB サーバーに到達できない → `ping 192.168.1.111`
- 共有名が間違っている → `smbclient -L //192.168.1.111 -U <ユーザー名>` で共有一覧を確認

### バックアップジョブが失敗する

実行履歴の詳細画面でエラーメッセージを確認する。

よくある原因:
- UNC パスとローカルパスのマッピングが間違っている → 設定画面で確認
- コピー元のフォルダが空またはアクセス権がない → `ls /mnt/smb/nas1/` で確認
- コピー先に書き込み権限がない → `touch /mnt/smb/bkup/test && rm /mnt/smb/bkup/test`

### メモリ不足

```bash
free -h
pm2 monit
```

Pi 3 (1GB RAM) では通常 450MB 程度の空きがある。不足する場合はスワップを追加:

```bash
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile   # CONF_SWAPSIZE=512 に変更
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

## 10. アップデート手順

新しいバージョンがリリースされた場合:

```bash
cd /opt/pi-lot
git pull
rm -rf node_modules package-lock.json
npm install
npm run build -w apps/web
npm run build -w apps/server
pm2 restart pi-lot
```
