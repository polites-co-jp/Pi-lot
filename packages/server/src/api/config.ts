import type { FastifyInstance } from 'fastify';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, reloadConfig } from '../config.js';
import type { SmbMount } from '../config.js';

const CONFIG_PATH = resolve(process.cwd(), 'config', 'pilot.config.json');

function saveConfig(config: ReturnType<typeof loadConfig>): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  reloadConfig();
}

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', (app as any).authenticate);

  app.get('/api/config/smb-mounts', async () => {
    const config = loadConfig();
    return { data: config.smb_mounts };
  });

  app.put<{ Body: { data: SmbMount[] } }>('/api/config/smb-mounts', async (request) => {
    const config = loadConfig();
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    raw.smb_mounts = request.body.data;
    saveConfig(raw);
    return { data: request.body.data };
  });

  app.get('/api/config/discord', async () => {
    const config = loadConfig();
    return { webhook_url: config.discord.webhook_url };
  });

  app.put<{ Body: { webhook_url: string } }>('/api/config/discord', async (request) => {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    raw.discord.webhook_url = request.body.webhook_url;
    saveConfig(raw);
    return { webhook_url: request.body.webhook_url };
  });
}
