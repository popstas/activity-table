import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { format } from 'date-fns';
import { z } from 'zod';
import { aggregateActivity, listMetrics, queryActivity, rowsToCompact } from './data';
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

  // Build dynamic enum for metric names based on available metrics
  const metricNames = listMetrics({}).map((m) => m.name);
  const metricSchema =
    metricNames.length === 0
      ? z.string()
      : metricNames.length === 1
      ? z.literal(metricNames[0])
      : z.union(metricNames.map((n) => z.literal(n)));

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
            type: 'text',
            text: JSON.stringify(data),
          },
        ],
      };
    }
  );

  server.tool(
    'activity_query',
    'Сырые данные по метрике или тегу за период. Укажите from/to в формате yyyy-mm-dd (строгий формат). По умолчанию возвращает компактный JSON: {"<metric>": {"YYYY-MM-DD": value}}; используйте format="text" для текстового вывода.',
    {
      metric: metricSchema.optional(),
      tag: z.string().optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'формат yyyy-mm-dd').optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'формат yyyy-mm-dd').optional(),
      format: z.enum(['json', 'text']).optional(),
    },
    async (input) => {
      const { metric, tag, from, to, format: outFormat } = input || {};
      if (!metric && !tag) {
        throw new Error('Нужно указать metric или tag');
      }
      const rows = queryActivity({ metric, tag, from, to });
      if (outFormat === 'text') {
        const text = rows.map(r => `${r.date}\t${r.metric}\t${r.value}`).join('\n');
        return {
          content: [
            {
              type: 'text',
              text,
            },
          ],
        };
      }
      const compact = rowsToCompact(rows);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(compact),
          },
        ],
      };
    }
  );

  server.tool(
    'activity_aggregate',
    'Агрегирование метрик за период (задайте from/to в формате yyyy-mm-dd): mean, sum, min, max, median, movavg, completion.',
    {
      metric: metricSchema.optional(),
      tag: z.string().optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'формат yyyy-mm-dd').optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'формат yyyy-mm-dd').optional(),
      agg: z.enum(['mean', 'avg', 'sum', 'min', 'max', 'median', 'movavg', 'completion']),
      window: z.number().optional(),
    },
    async (input) => {
      const { metric, tag, from, to, agg, window } = input || {};
      if (!metric && !tag) {
        throw new Error('Нужно указать metric или tag');
      }
      const result = aggregateActivity({ metric, tag, from, to, agg, window });
      return {
        content: [
          {
            type: 'text',
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
      metric: metricSchema,
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


