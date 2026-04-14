"use client";

import { format, subDays, getDay } from "date-fns";

interface HeatmapData {
  date: string;
  count: number;
}

function getColor(count: number): string {
  if (count === 0) return "bg-muted";
  if (count <= 2) return "bg-emerald-200";
  if (count <= 5) return "bg-emerald-400";
  if (count <= 10) return "bg-emerald-600";
  return "bg-emerald-800";
}

export function ActivityHeatmap({ data }: { data: HeatmapData[] }) {
  const dataMap = new Map(data.map((d) => [d.date, d.count]));

  // Generate last 30 days
  const days: { date: string; count: number; dayOfWeek: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = subDays(new Date(), i);
    const dateStr = format(d, "yyyy-MM-dd");
    days.push({
      date: dateStr,
      count: dataMap.get(dateStr) || 0,
      dayOfWeek: getDay(d),
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1 flex-wrap">
        {days.map((day) => (
          <div
            key={day.date}
            className={`w-6 h-6 rounded-sm ${getColor(day.count)} cursor-pointer`}
            title={`${day.date}: ${day.count} commits`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Less</span>
        <div className="w-3 h-3 rounded-sm bg-muted" />
        <div className="w-3 h-3 rounded-sm bg-emerald-200" />
        <div className="w-3 h-3 rounded-sm bg-emerald-400" />
        <div className="w-3 h-3 rounded-sm bg-emerald-600" />
        <div className="w-3 h-3 rounded-sm bg-emerald-800" />
        <span>More</span>
      </div>
    </div>
  );
}
