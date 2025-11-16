import fs from 'fs';
import path from 'path';
import { addDays, isAfter, isBefore, parseISO, startOfDay } from 'date-fns';

export type MetricRow = {
  date: string;
  metric: string;
  value: number;
  tags?: string[];
};

export function loadItems(): MetricRow[] {
  const file = path.join(process.cwd(), 'data', 'items.json');
  const raw = fs.readFileSync(file, 'utf-8');
  const items = JSON.parse(raw) as Array<any>;
  return items
    .filter(it => it && it.date && it.indicator !== undefined)
    .map(it => ({
      date: String(it.date),
      metric: String(it.indicator),
      value: typeof it.value === 'string' ? Number(it.value) : Number(it.value),
      tags: Array.isArray(it.tags)
        ? it.tags
        : typeof it.tags === 'string'
        ? String(it.tags)
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : [],
    }));
}

export function listMetrics(filter: { tag?: string } = {}) {
  const items = loadItems();
  const set = new Map<string, { name: string; tags: string[] }>();
  for (const it of items) {
    if (filter.tag && !(it.tags || []).includes(filter.tag)) continue;
    if (!set.has(it.metric)) {
      set.set(it.metric, { name: it.metric, tags: it.tags || [] });
    }
  }
  return Array.from(set.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export type DateRange = { start?: Date | null; end?: Date | null } | null;

export function parseRange(range?: string | null): DateRange {
  if (!range) return null;
  const now = new Date();
  const m = String(range).trim();
  if (m.includes(':')) {
    const [start, end] = m.split(':');
    return {
      start: start ? parseISO(start) : null,
      end: end ? parseISO(end) : null,
    };
  }
  const last = m.match(/^last\s+(\d+)\s*([dwm])$/i);
  if (last) {
    const n = Number(last[1]);
    const unit = last[2].toLowerCase();
    let start = now;
    if (unit === 'd') start = addDays(now, -n);
    if (unit === 'w') start = addDays(now, -n * 7);
    if (unit === 'm') start = addDays(now, -Math.round(n * 30));
    return { start: startOfDay(start), end: now };
  }
  const year = m.match(/^(\d{4})$/);
  if (year) {
    const y = Number(year[1]);
    return { start: parseISO(`${y}-01-01`), end: parseISO(`${y}-12-31`) };
  }
  const q = m.match(/^(\d{4})q([1-4])$/i);
  if (q) {
    const y = Number(q[1]);
    const qi = Number(q[2]);
    const starts = ['01-01', '04-01', '07-01', '10-01'] as const;
    const ends = ['03-31', '06-30', '09-30', '12-31'] as const;
    return { start: parseISO(`${y}-${starts[qi - 1]}`), end: parseISO(`${y}-${ends[qi - 1]}`) };
  }
  return null;
}

function inRange(dateStr: string, range: DateRange) {
  if (!range) return true;
  const d = parseISO(dateStr);
  if (range.start && isBefore(d, range.start)) return false;
  if (range.end && isAfter(d, range.end)) return false;
  return true;
}

export function queryActivity(params: { metric?: string; tag?: string; range?: string | null }) {
  const { metric, tag, range } = params || {};
  const items = loadItems();
  const parsedRange = parseRange(range || undefined);
  const result = [] as Array<{ date: string; metric: string; value: number }>;
  for (const it of items) {
    if (metric && it.metric !== metric) continue;
    if (tag && !(it.tags || []).includes(tag)) continue;
    if (!inRange(it.date, parsedRange)) continue;
    result.push({ date: it.date, metric: it.metric, value: Number(it.value) });
  }
  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

function aggregate(values: number[], agg: string, options: { window?: number } = {}) {
  if (!values.length) return null as number | null | number[];
  const nums = values.map(v => Number(v)).filter(v => Number.isFinite(v));
  if (!nums.length) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / nums.length;
  if (agg === 'sum') return sum;
  if (agg === 'mean' || agg === 'avg') return mean;
  if (agg === 'min') return Math.min(...nums);
  if (agg === 'max') return Math.max(...nums);
  if (agg === 'median') {
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  if (agg === 'completion') {
    const ones = nums.filter(n => n > 0).length;
    return ones / nums.length;
  }
  if (agg === 'movavg') {
    const window = Number(options.window) || 7;
    const series: number[] = [];
    for (let i = 0; i < nums.length; i++) {
      const start = Math.max(0, i - window + 1);
      const arr = nums.slice(start, i + 1);
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      series.push(m);
    }
    return series;
  }
  return mean;
}

export function aggregateActivity(params: { metric?: string; tag?: string; range?: string | null; agg: string; window?: number }) {
  const { metric, tag, range, agg, window } = params;
  const rows = queryActivity({ metric, tag, range });
  if (agg === 'movavg') {
    const byDate = rows.map(r => ({ date: r.date, value: r.value }));
    const series = aggregate(byDate.map(r => r.value), 'movavg', { window }) as number[];
    const out: Array<{ date: string; value: number }> = [];
    for (let i = 0; i < byDate.length; i++) {
      out.push({ date: byDate[i].date, value: series[i] });
    }
    return out;
  }
  const value = aggregate(rows.map(r => r.value), agg) as number | null;
  return { agg, value, count: rows.length };
}


