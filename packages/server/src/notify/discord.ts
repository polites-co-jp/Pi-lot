import { loadConfig } from '../config.js';

export async function sendDiscordNotification(message: string): Promise<void> {
  const config = loadConfig();
  const url = config.discord.webhook_url;
  if (!url) return;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
    if (!res.ok) {
      console.error(`Discord通知送信失敗: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error('Discord通知送信エラー:', err);
  }
}

export function formatStartNotification(jobName: string, time: string): string {
  return `📦 バックアップ開始\nジョブ: ${jobName}\n時刻: ${time}`;
}

export function formatSuccessNotification(
  jobName: string,
  startTime: string,
  endTime: string,
  filesCopied: number,
  totalSize: string
): string {
  return `✅ バックアップ完了\nジョブ: ${jobName}\n時刻: ${startTime} → ${endTime}\n件数: ${filesCopied}ファイル / ${totalSize}`;
}

export function formatErrorNotification(
  jobName: string,
  time: string,
  errorMessage: string
): string {
  return `❌ バックアップ失敗\nジョブ: ${jobName}\n時刻: ${time}\nエラー: ${errorMessage}`;
}

export function formatDispatchStartNotification(jobName: string, time: string): string {
  return `📂 ファイル振り分け開始\nジョブ: ${jobName}\n時刻: ${time}`;
}

export function formatDispatchSuccessNotification(
  jobName: string,
  startTime: string,
  endTime: string,
  filesProcessed: number,
  totalSize: string
): string {
  return `✅ ファイル振り分け完了\nジョブ: ${jobName}\n時刻: ${startTime} → ${endTime}\n処理: ${filesProcessed}ファイル / ${totalSize}`;
}

export function formatDispatchErrorNotification(
  jobName: string,
  time: string,
  errorMessage: string
): string {
  return `❌ ファイル振り分け失敗\nジョブ: ${jobName}\n時刻: ${time}\nエラー: ${errorMessage}`;
}
