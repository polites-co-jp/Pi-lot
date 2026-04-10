import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface SmbMount {
  unc_path: string;
  local_path: string;
}

export interface AppConfig {
  admin: {
    username: string;
    password: string;
  };
  jwt: {
    secret: string;
    expires_in: string;
  };
  discord: {
    webhook_url: string;
  };
  smb_mounts: SmbMount[];
  server: {
    port: number;
    host: string;
  };
}


const CONFIG_PATH = resolve(process.cwd(), 'config', 'pilot.config.json');

let cachedConfig: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `設定ファイルが見つかりません: ${CONFIG_PATH}\nconfig/pilot.config.example.json をコピーして作成してください。`
    );
  }

  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  cachedConfig = JSON.parse(raw) as AppConfig;
  return cachedConfig;
}

export function reloadConfig(): AppConfig {
  cachedConfig = null;
  return loadConfig();
}

export function resolveUncToLocal(uncPath: string, config: AppConfig): string | null {
  const normalized = uncPath.replace(/\\/g, '/').toLowerCase();
  for (const mount of config.smb_mounts) {
    const mountNorm = mount.unc_path.replace(/\\/g, '/').toLowerCase();
    if (normalized.startsWith(mountNorm)) {
      const rest = uncPath.slice(mount.unc_path.length).replace(/\\/g, '/');
      return mount.local_path + rest;
    }
  }
  return null;
}
