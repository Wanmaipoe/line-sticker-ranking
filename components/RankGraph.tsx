'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface DataPoint {
  snapshot_date: string;
  snapshot_hour: number;
  rank: number;
}

interface Props {
  data: DataPoint[];
  countryName: string;
  countryFlag: string;
}

function formatDate(d: DataPoint) {
  return new Date(`${d.snapshot_date}T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
  });
}

function formatHour(d: DataPoint) {
  const date = new Date(
    `${d.snapshot_date}T${String(d.snapshot_hour).padStart(2, '0')}:00:00Z`
  );
  return date.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    hour12: false,
  });
}

function groupByDay(data: DataPoint[]): DataPoint[] {
  const byDay: Record<string, DataPoint> = {};
  for (const d of data) {
    if (!byDay[d.snapshot_date] || d.rank < byDay[d.snapshot_date].rank) {
      byDay[d.snapshot_date] = d;
    }
  }
  return Object.values(byDay).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
}

export default function RankGraph({ data, countryName, countryFlag }: Props) {
  const [freq, setFreq] = useState<'daily' | 'hourly'>('daily');

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No data available for this country
      </div>
    );
  }

  const uniqueDates = new Set(data.map((d) => d.snapshot_date)).size;
  const uniqueSlots = new Set(data.map((d) => `${d.snapshot_date}-${d.snapshot_hour}`)).size;
  const hasHourlyData = uniqueSlots > uniqueDates;
  // Always show toggle so user can switch; hourly = daily when only 1 point/day

  const display = freq === 'daily' ? groupByDay(data) : data;
  const chartData = display.map((d) => ({
    label: freq === 'daily' ? formatDate(d) : formatHour(d),
    rank: d.rank,
    raw: d,
  }));

  const minRank = Math.min(...chartData.map((d) => d.rank));
  const maxRank = Math.max(...chartData.map((d) => d.rank));
  const first = chartData[0].rank;
  const last = chartData[chartData.length - 1].rank;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{countryFlag}</span>
        <div className="flex-1">
          <p className="font-semibold text-sm">{countryName}</p>
          <p className="text-xs text-gray-400">Last 30 days · Click a point for details</p>
        </div>
        {data.length > 1 && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              last < first
                ? 'bg-green-100 text-green-700'
                : last > first
                ? 'bg-red-100 text-red-500'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {last < first
              ? `↑ Up ${first - last}`
              : last > first
              ? `↓ Down ${last - first}`
              : '— Flat'}
          </span>
        )}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs ml-1">
          <button
            onClick={() => setFreq('daily')}
            className={`px-2.5 py-1 transition-colors ${
              freq === 'daily' ? 'bg-green-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => setFreq('hourly')}
            disabled={!hasHourlyData}
            className={`px-2.5 py-1 transition-colors ${
              freq === 'hourly'
                ? 'bg-green-500 text-white'
                : hasHourlyData
                ? 'bg-white text-gray-500 hover:bg-gray-50'
                : 'bg-white text-gray-300 cursor-not-allowed'
            }`}
            title={!hasHourlyData ? 'Hourly data available after cron runs multiple times' : undefined}
          >
            Hourly
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            interval="preserveStartEnd"
          />
          <YAxis
            reversed
            domain={[Math.max(1, minRank - 2), Math.min(50, maxRank + 2)]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={(v) => `#${v}`}
            width={30}
          />
          <Tooltip
            formatter={(value) => [`#${value}`, 'Rank']}
            labelStyle={{ fontSize: 11 }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          {minRank <= 3 && (
            <ReferenceLine
              y={minRank}
              stroke="#f59e0b"
              strokeDasharray="4 2"
              label={{
                value: `Best #${minRank}`,
                fontSize: 10,
                fill: '#f59e0b',
                position: 'insideTopRight',
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="rank"
            stroke="#06c755"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#06c755', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#06c755' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
