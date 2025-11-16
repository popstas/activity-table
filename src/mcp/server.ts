import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { format } from 'date-fns';
import { z } from 'zod';
import { aggregateActivity, listMetrics, queryActivity } from './data';
// actions.js is CommonJS; tsx supports interop via require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setMetric } = require('../actions');

async function main() {
  const server = new McpServer(
    {
      name: 'activity-table-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.tool(
    'activity_list_metrics',
    'Список доступных метрик (индикаторов). Необязательный фильтр по тегу.',
    {
      tag: z.string().optional(),
    },
    async (input) => {
      const tag = input?.tag;
      const data = listMetrics({ tag });
      return {
        content: [
          {
            type: 'json',
            text: JSON.stringify(data),
          },
        ],
      };
    }
  );

  server.tool(
    'activity_query',
    'Сырые данные по метрике или тегу за период.',
    {
      metric: z.string().optional(),
      tag: z.string().optional(),
      range: z.string().optional(),
      format: z.enum(['json', 'text']).optional(),
    },
    async (input) => {
      const { metric, tag, range } = input || {};
      if (!metric && !tag) {
        throw new Error('Нужно указать metric или tag');
      }
      const rows = queryActivity({ metric, tag, range });
      return {
        content: [
          {
            type: 'json',
            text: JSON.stringify(rows),
          },
        ],
      };
    }
  );

  server.tool(
    'activity_aggregate',
    'Агрегирование метрик за период: mean, sum, min, max, median, movavg, completion.',
    {
      metric: z.string().optional(),
      tag: z.string().optional(),
      range: z.string().optional(),
      agg: z.enum(['mean', 'avg', 'sum', 'min', 'max', 'median', 'movavg', 'completion']),
      window: z.number().optional(),
    },
    async (input) => {
      const { metric, tag, range, agg, window } = input || {};
      if (!metric && !tag) {
        throw new Error('Нужно указать metric или tag');
      }
      const result = aggregateActivity({ metric, tag, range, agg, window });
      return {
        content: [
          {
            type: 'json',
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );

  server.tool(
    'activity_add',
    'Добавить или обновить значение метрики в Google Sheets по дате.',
    {
      metric: z.string(),
      date: z.string().optional(), // YYYY-MM-DD
      value: z.string(), // allow "+N"
      overwrite: z.boolean().optional(),
    },
    async (input) => {
      const hoursOffset = 6;
      const today = format(Date.now() - hoursOffset * 3600000, 'yyyy-MM-dd');
      const metric = input.metric;
      const date = input.date || today;
      const value = String(input.value);
      await setMetric({ indicator: metric, value, date }, { overwrite: !!input.overwrite });
      return {
        content: [
          {
            type: 'text',
            text: `Entry recorded: ${metric} ${date} = ${value}`,
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


