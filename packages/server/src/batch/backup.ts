import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, resolveUncToLocal } from '../config.js';
import type { BackupJob } from '../db/jobs.js';
import { createExecution, updateExecutionSuccess, updateExecutionFailed, getLastSuccessfulExecution } from '../db/executions.js';
import { sendDiscordNotification, formatStartNotification, formatSuccessNotification, formatErrorNotification } from '../notify/discord.js';

function formatDateTime(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${d}-${h}${mi}${s}`;
}

function formatReadableDateTime(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}/${mo}/${d} ${h}:${mi}:${s}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 0 ? 1 : 0)}${units[i]}`;
}

function parseRsyncStats(output: string): { filesCopied: number; totalSize: number } {
  let filesCopied = 0;
  let totalSize = 0;

  const filesMatch = output.match(/Number of regular files transferred:\s*(\d+)/);
  if (filesMatch) filesCopied = parseInt(filesMatch[1], 10);

  const sizeMatch = output.match(/Total transferred file size:\s*([\d,]+)/);
  if (sizeMatch) totalSize = parseInt(sizeMatch[1].replace(/,/g, ''), 10);

  return { filesCopied, totalSize };
}

function runRsync(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn('rsync', args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    proc.on('error', (err) => {
      resolve({ stdout, stderr: err.message, code: 1 });
    });
  });
}

function cleanOldGenerations(destLocalPath: string, retention: number): void {
  if (retention <= 0) return;

  try {
    const entries = readdirSync(destLocalPath)
      .filter((name) => /^\d{8}-\d{6}$/.test(name))
      .sort();

    const toDelete = entries.length - retention;
    if (toDelete <= 0) return;

    for (let i = 0; i < toDelete; i++) {
      const fullPath = resolve(destLocalPath, entries[i]);
      rmSync(fullPath, { recursive: true, force: true });
      console.log(`世代管理: 削除 ${entries[i]}`);
    }
  } catch (err) {
    console.error('世代管理エラー:', err);
  }
}

export async function executeBackupJob(job: BackupJob): Promise<void> {
  const config = loadConfig();
  const now = new Date();
  const folderName = formatDateTime(now);
  const readableStart = formatReadableDateTime(now);

  const sourceLocal = resolveUncToLocal(job.source_path, config);
  const destLocal = resolveUncToLocal(job.dest_path, config);

  if (!sourceLocal || !destLocal) {
    console.error(`UNCパスの解決に失敗: source=${job.source_path}, dest=${job.dest_path}`);
    const exec = createExecution(job.id, folderName);
    updateExecutionFailed(exec.id, 'UNCパスをローカルパスに変換できません。SMBマウント設定を確認してください。');
    if (job.notify_on_error) {
      await sendDiscordNotification(
        formatErrorNotification(job.name, readableStart, 'UNCパス変換エラー')
      );
    }
    return;
  }

  const execution = createExecution(job.id, folderName);

  if (job.notify_on_start) {
    await sendDiscordNotification(formatStartNotification(job.name, readableStart));
  }

  try {
    const destFolder = resolve(destLocal, folderName);
    mkdirSync(destFolder, { recursive: true });

    const rsyncArgs = ['-av', '--stats'];

    if (job.filter_mode === 'incremental') {
      const lastSuccess = getLastSuccessfulExecution(job.id);
      if (lastSuccess?.started_at) {
        rsyncArgs.push(`--newer-mtime=${lastSuccess.started_at}`);
      }
    }

    const sourcePath = sourceLocal.endsWith('/') ? sourceLocal : sourceLocal + '/';
    rsyncArgs.push(sourcePath, destFolder + '/');

    console.log(`rsync 実行: rsync ${rsyncArgs.join(' ')}`);
    const result = await runRsync(rsyncArgs);

    if (result.code !== 0) {
      throw new Error(result.stderr || `rsync exited with code ${result.code}`);
    }

    const stats = parseRsyncStats(result.stdout);
    const totalSizeStr = formatBytes(stats.totalSize);

    updateExecutionSuccess(execution.id, stats.filesCopied, totalSizeStr);

    cleanOldGenerations(destLocal, job.retention);

    if (job.notify_on_success) {
      const endTime = formatReadableDateTime(new Date());
      await sendDiscordNotification(
        formatSuccessNotification(job.name, readableStart, endTime, stats.filesCopied, totalSizeStr)
      );
    }

    console.log(`バックアップ完了: ${job.name} (${stats.filesCopied}ファイル, ${totalSizeStr})`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    updateExecutionFailed(execution.id, errorMessage);

    if (job.notify_on_error) {
      await sendDiscordNotification(
        formatErrorNotification(job.name, readableStart, errorMessage)
      );
    }

    console.error(`バックアップ失敗: ${job.name}`, errorMessage);
  }
}
