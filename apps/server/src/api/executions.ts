import type { FastifyInstance } from 'fastify';
import { getExecutionsByJobId, getExecutionById } from '../db/executions.js';

export async function executionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', (app as any).authenticate);

  app.get<{ Params: { id: string }; Querystring: { page?: string; per_page?: string } }>(
    '/api/jobs/:id/executions',
    async (request) => {
      const jobId = Number(request.params.id);
      const page = Number(request.query.page) || 1;
      const perPage = Number(request.query.per_page) || 20;

      const { data, total } = getExecutionsByJobId(jobId, page, perPage);

      return {
        data,
        pagination: {
          page,
          per_page: perPage,
          total,
        },
      };
    }
  );

  app.get<{ Params: { id: string } }>('/api/executions/:id', async (request, reply) => {
    const execution = getExecutionById(Number(request.params.id));
    if (!execution) return reply.status(404).send({ error: '実行履歴が見つかりません' });
    return execution;
  });
}
