import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
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

      const token = jwt.sign({ username }, config.jwt.secret, { expiresIn: config.jwt.expires_in as jwt.SignOptions['expiresIn'] });
      return { token };
    }
  );
}

export async function authHook(app: FastifyInstance): Promise<void> {
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new Error('No token');
      }
      const token = authHeader.slice(7);
      const config = loadConfig();
      jwt.verify(token, config.jwt.secret);
    } catch {
      reply.status(401).send({ error: '認証が必要です' });
    }
  });
}
