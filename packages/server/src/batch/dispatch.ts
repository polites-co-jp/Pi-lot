import { readdirSync, copyFileSync, renameSync, unlinkSync, statSync, mkdirSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { loadConfig, resolveUncToLocal } from '../config.js';
import type { BackupJob, DispatchRule } from '../db/jobs.js';
import { getDispatchRules } from '../db/jobs.js';
import { createExecution, updateExecutionSuccess, updateExecutionFailed } from '../db/executions.js';
import { sendDiscordNotification, formatDispatchStartNotification, formatDispatchSuccessNotification, formatDispatchErrorNotification } from '../notify/discord.js';
import { formatDateTime, formatReadableDateTime, formatBytes } from './backup.js';

interface CompiledRule {
  regex: RegExp;
  destLocal: string;
}

function compileRules(rules: DispatchRule[], config: ReturnType<typeof loadConfig>): CompiledRule[] {
  const compiled: CompiledRule[] = [];
  for (const rule of rules) {
    const destLocal = resolveUncToLocal(rule.dest_path, config);
    if (!destLocal) {
      throw new Error(`ルール(priority=${rule.priority})の移動先UNCパスを解決できません: ${rule.dest_path}`);
    }
    compiled.push({ regex: new RegExp(rule.pattern), destLocal });
  }
  return compiled;
}

function moveFile(src: string, dest: string): void {
  try {
    renameSync(src, dest);
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      copyFileSync(src, dest);
      unlinkSync(src);
    } else {
      throw err;
    }
  }
}

export async function executeDispatchJob(job: BackupJob): Promise<void> {
  const config = loadConfig();
  const now = new Date();
  const folderName = formatDateTime(now);
  const readableStart = formatReadableDateTime(now);

  const sourceLocal = resolveUncToLocal(job.source_path, config);
  if (!sourceLocal) {
    console.error(`UNCパスの解決に失敗: source=${job.source_path}`);
    const exec = createExecution(job.id, folderName);
    updateExecutionFailed(exec.id, '監視フォルダのUNCパスをローカルパスに変換できません。SMBマウント設定を確認してください。');
    if (job.notify_on_error) {
      await sendDiscordNotification(
        formatDispatchErrorNotification(job.name, readableStart, 'UNCパス変換エラー')
      );
    }
    return;
  }

  const rules = getDispatchRules(job.id);
  let compiledRules: CompiledRule[];
  try {
    compiledRules = compileRules(rules, config);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`ルールコンパイルエラー: ${job.name}`, msg);
    const exec = createExecution(job.id, folderName);
    updateExecutionFailed(exec.id, msg);
    if (job.notify_on_error) {
      await sendDiscordNotification(formatDispatchErrorNotification(job.name, readableStart, msg));
    }
    return;
  }

  let defaultDestLocal: string | null = null;
  if (job.default_dest_path) {
    defaultDestLocal = resolveUncToLocal(job.default_dest_path, config);
    if (!defaultDestLocal) {
      const exec = createExecution(job.id, folderName);
      updateExecutionFailed(exec.id, `デフォルト移動先のUNCパスを解決できません: ${job.default_dest_path}`);
      if (job.notify_on_error) {
        await sendDiscordNotification(
          formatDispatchErrorNotification(job.name, readableStart, 'デフォルト移動先UNCパス変換エラー')
        );
      }
      return;
    }
  }

  const execution = createExecution(job.id, folderName);

  if (job.notify_on_start) {
    await sendDiscordNotification(formatDispatchStartNotification(job.name, readableStart));
  }

  try {
    const entries = readdirSync(sourceLocal);
    let filesProcessed = 0;
    let totalBytes = 0;

    for (const entry of entries) {
      const fullPath = resolve(sourceLocal, entry);
      let st;
      try {
        st = statSync(fullPath);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;

      const fileName = basename(entry);

      let destLocal: string | null = null;
      for (const rule of compiledRules) {
        if (rule.regex.test(fileName)) {
          destLocal = rule.destLocal;
          break;
        }
      }

      if (!destLocal) {
        if (defaultDestLocal) {
          destLocal = defaultDestLocal;
        } else {
          continue;
        }
      }

      mkdirSync(destLocal, { recursive: true });
      const destFile = join(destLocal, fileName);

      if (job.file_action === 'move') {
        moveFile(fullPath, destFile);
      } else {
        copyFileSync(fullPath, destFile);
      }

      totalBytes += st.size;
      filesProcessed++;
    }

    const totalSizeStr = formatBytes(totalBytes);
    updateExecutionSuccess(execution.id, filesProcessed, totalSizeStr);

    if (job.notify_on_success) {
      const endTime = formatReadableDateTime(new Date());
      await sendDiscordNotification(
        formatDispatchSuccessNotification(job.name, readableStart, endTime, filesProcessed, totalSizeStr)
      );
    }

    console.log(`ファイル振り分け完了: ${job.name} (${filesProcessed}ファイル, ${totalSizeStr})`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    updateExecutionFailed(execution.id, errorMessage);

    if (job.notify_on_error) {
      await sendDiscordNotification(
        formatDispatchErrorNotification(job.name, readableStart, errorMessage)
      );
    }

    console.error(`ファイル振り分け失敗: ${job.name}`, errorMessage);
  }
}
