"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface TrendPoint {
  date: string;
  value: number;
  baseline?: number;
}

export function ScoreTrendChart({
  data,
  engineerName,
}: {
  data: TrendPoint[];
  engineerName?: string;
}) {
  const hasBaseline = data.some((d) => typeof d.baseline === "number");
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis domain={[0, 100]} />
        <Tooltip />
        {hasBaseline && <Legend />}
        <Line
          type="monotone"
          dataKey="value"
          stroke="#2563eb"
          strokeWidth={2}
          dot={{ r: 3 }}
          name={engineerName || "Engineer"}
        />
        {hasBaseline && (
          <Line
            type="monotone"
            dataKey="baseline"
            stroke="#6b7280"
            strokeDasharray="5 5"
            strokeWidth={1.5}
            dot={false}
            name="Team average"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CommitBarChart({
  data,
}: {
  data: { name: string; commits: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis />
        <Tooltip />
        <Bar dataKey="commits" fill="#2563eb" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
