import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { username: string; password: string } }>(
    '/api/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const config = loadConfig();

      if (username !== config.admin.username || password !== config.admin.password) {
        return reply.status(401).send({ error: 'ユーザー名またはパスワードが正しくありません' });
      }

      const token = app.jwt.sign({ username }, { expiresIn: config.jwt.expires_in });
      return { token };
    }
  );
}

export async function authHook(app: FastifyInstance): Promise<void> {
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ error: '認証が必要です' });
    }
  });
}
