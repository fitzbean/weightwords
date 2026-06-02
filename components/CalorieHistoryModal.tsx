import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { UserProfile, FoodLog, WeighIn } from '../types';
import { getFoodLogsInRange, getEarliestFoodLogDate, getWeighIns } from '../services/supabaseService';

interface CalorieHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  profile: UserProfile | null;
}

type RangeKey = '1m' | '3m' | '6m' | 'all';

interface RangeOption {
  key: RangeKey;
  label: string;
  months: number | null; // null = all time
}

const RANGE_OPTIONS: RangeOption[] = [
  { key: '1m', label: '1M', months: 1 },
  { key: '3m', label: '3M', months: 3 },
  { key: '6m', label: '6M', months: 6 },
  { key: 'all', label: 'ALL', months: null },
];

// Build a YYYY-MM-DD string from a Date in the browser's local timezone
const toLocalDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Add `days` calendar days to a date and return a new Date at local midnight
const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const CalorieHistoryModal: React.FC<CalorieHistoryModalProps> = ({ isOpen, onClose, userId, profile }) => {
  const [range, setRange] = useState<RangeKey>('1m');
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [earliestDate, setEarliestDate] = useState<Date | null>(null);
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);

  const timezone = profile?.timezone;

  // Calculate daily calorie targets based on current weight (using Mifflin-St Jeor equation)
  const calculateCalorieTargets = (): { goalTarget: number; maintenanceTarget: number } => {
    if (!profile) return { goalTarget: 2000, maintenanceTarget: 2000 };

    const latestWeighIn = weighIns.length > 0 ? weighIns[weighIns.length - 1] : null;
    const currentWeight = latestWeighIn?.weightLbs || profile.weightLbs || 150;

    const weightKg = currentWeight * 0.453592;
    const heightCm = ((profile.heightFt || 5) * 12 + (profile.heightIn || 10)) * 2.54;
    const age = profile.age || 25;

    // BMR calculation
    let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
    if (profile.gender === 'female') {
      bmr -= 161;
    }

    // Apply activity level
    const tdee = bmr * parseFloat(profile.activityLevel || '1.55');

    return {
      goalTarget: Math.round(tdee + parseFloat(profile.weightGoal || '0')),
      maintenanceTarget: Math.round(tdee),
    };
  };

  const { goalTarget: goalCalorieTarget } = calculateCalorieTargets();
  const dailyTarget = goalCalorieTarget;

  // Determine the active start/end dates for the selected range
  const rangeBounds = useMemo(() => {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const option = RANGE_OPTIONS.find(o => o.key === range);
    let start: Date;
    if (option?.months == null) {
      // All time: use earliest known log date, falling back to 1 year ago
      if (earliestDate) {
        start = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), earliestDate.getDate());
      } else {
        start = addDays(end, -365);
      }
    } else {
      // Subtract months using actual date arithmetic
      start = new Date(today.getFullYear(), today.getMonth() - option.months, today.getDate());
    }
    return { start, end };
  }, [range, earliestDate]);

  // Load the earliest log date once when the modal opens (for "All Time")
  useEffect(() => {
    if (isOpen && userId) {
      getEarliestFoodLogDate(userId, timezone).then(d => setEarliestDate(d));
    }
  }, [isOpen, userId, timezone]);

  // Load weigh-ins to calculate accurate calorie target
  useEffect(() => {
    if (isOpen && userId) {
      getWeighIns(userId).then(data => setWeighIns(data));
    }
  }, [isOpen, userId]);

  // Fetch logs whenever the range or bounds change
  useEffect(() => {
    if (!isOpen || !userId) return;
    let cancelled = false;
    const fetchLogs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getFoodLogsInRange(userId, rangeBounds.start, rangeBounds.end, timezone);
        if (!cancelled) setLogs(data);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load calorie history');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [isOpen, userId, rangeBounds.start.getTime(), rangeBounds.end.getTime(), timezone]);

  // Group logs into per-day totals and fill missing days with null so the
  // chart shows gaps instead of misleading zero-calorie days.
  const chartData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const log of logs) {
      const key = toLocalDateKey(new Date(log.date));
      totals.set(key, (totals.get(key) ?? 0) + (log.calories || 0));
    }

    const days: { date: string; key: string; calories: number | null }[] = [];
    const cursor = new Date(rangeBounds.start);
    const endKey = toLocalDateKey(rangeBounds.end);
    while (toLocalDateKey(cursor) <= endKey) {
      const key = toLocalDateKey(cursor);
      const cals = totals.has(key) ? totals.get(key)! : null;
      days.push({
        key,
        date: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        calories: cals,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [logs, rangeBounds.start, rangeBounds.end]);

  // Summary statistics computed from the chart data
  const summary = useMemo(() => {
    const loggedDays = chartData.filter(d => d.calories != null) as { date: string; key: string; calories: number }[];
    const total = loggedDays.reduce((sum, d) => sum + d.calories, 0);
    const daysCount = loggedDays.length;
    const avg = daysCount > 0 ? Math.round(total / daysCount) : 0;
    const max = daysCount > 0 ? loggedDays.reduce((m, d) => (d.calories > m ? d.calories : m), 0) : 0;
    const min = daysCount > 0 ? loggedDays.reduce((m, d) => (d.calories < m ? d.calories : m), Number.POSITIVE_INFINITY) : 0;
    return { total, daysCount, avg, max, min: min === Number.POSITIVE_INFINITY ? 0 : min };
  }, [chartData]);

  // Determine chart granularity label (day vs month) for the X axis
  const dayCount = chartData.length;
  const showMonthTicks = dayCount > 60;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 pb-0">
          <div>
            <h2 className="text-2xl font-black text-gray-100">Calorie History</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {rangeBounds.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {' – '}
              {rangeBounds.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* Range selector */}
          <div className="mt-4 mb-5">
            <div className="grid grid-cols-4 gap-2 bg-gray-900/40 border border-gray-700/50 rounded-xl p-1">
              {RANGE_OPTIONS.map(option => {
                const isActive = option.key === range;
                return (
                  <button
                    key={option.key}
                    onClick={() => setRange(option.key)}
                    className={`px-2 py-2 rounded-lg text-xs sm:text-sm font-black uppercase tracking-wider transition-colors ${
                      isActive
                        ? 'bg-green-600 text-white shadow-md shadow-green-900/30'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mx-auto"></div>
              <p className="text-xs text-gray-400 mt-3 font-bold uppercase tracking-widest">Loading history…</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-400 text-sm">{error}</div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-4 gap-1 sm:gap-3 mb-3">
                <div className="bg-gradient-to-br from-green-900/40 to-green-900/20 rounded-lg sm:rounded-2xl p-1.5 sm:p-4 border border-green-800/30">
                  <p className="text-[8px] sm:text-[10px] font-bold text-green-400/70 uppercase tracking-wider leading-tight">Days Logged</p>
                  <p className="text-xs sm:text-2xl font-black text-green-400 mt-0.5 sm:mt-1">
                    {summary.daysCount}
                    <span className="text-[8px] sm:text-xs ml-0.5 sm:ml-1 font-bold text-green-400/60">/ {dayCount}</span>
                  </p>
                </div>
                <div className="bg-gradient-to-br from-blue-900/40 to-blue-900/20 rounded-lg sm:rounded-2xl p-1.5 sm:p-4 border border-blue-800/30">
                  <p className="text-[8px] sm:text-[10px] font-bold text-blue-400/70 uppercase tracking-wider leading-tight">Daily Avg</p>
                  <p className="text-xs sm:text-2xl font-black text-blue-400 mt-0.5 sm:mt-1">
                    {summary.avg.toLocaleString()}
                    <span className="text-[8px] sm:text-xs ml-0.5 sm:ml-1 font-bold text-blue-400/60">kcal</span>
                  </p>
                </div>
                <div className="bg-gradient-to-br from-amber-900/40 to-amber-900/20 rounded-lg sm:rounded-2xl p-1.5 sm:p-4 border border-amber-800/30">
                  <p className="text-[8px] sm:text-[10px] font-bold text-amber-400/70 uppercase tracking-wider leading-tight">Highest</p>
                  <p className="text-xs sm:text-2xl font-black text-amber-400 mt-0.5 sm:mt-1">
                    {summary.max.toLocaleString()}
                    <span className="text-[8px] sm:text-xs ml-0.5 sm:ml-1 font-bold text-amber-400/60">kcal</span>
                  </p>
                </div>
                <div className="bg-gradient-to-br from-purple-900/40 to-purple-900/20 rounded-lg sm:rounded-2xl p-1.5 sm:p-4 border border-purple-800/30">
                  <p className="text-[8px] sm:text-[10px] font-bold text-purple-400/70 uppercase tracking-wider leading-tight">Total</p>
                  <p className="text-xs sm:text-2xl font-black text-purple-400 mt-0.5 sm:mt-1">
                    {summary.total.toLocaleString()}
                    <span className="text-[8px] sm:text-xs ml-0.5 sm:ml-1 font-bold text-purple-400/60">kcal</span>
                  </p>
                </div>
              </div>

              {summary.daysCount === 0 ? (
                <div className="py-12 text-center bg-gray-900/40 rounded-2xl border border-gray-700/50">
                  <p className="text-gray-400 text-sm">No food logs in this range yet.</p>
                  <p className="text-gray-500 text-xs mt-1">Try a wider time range to see more data.</p>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-5 border border-gray-700/50 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Calories per day</h4>
                    {dailyTarget != null && (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-900/30 text-blue-400">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v8" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h8" />
                        </svg>
                        {dailyTarget.toLocaleString()} <span className="text-[8px] sm:text-xs ml-0.5 sm:ml-1 font-bold text-blue-400/60">kcal</span>
                      </div>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="calorieGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity={0.45} />
                          <stop offset="50%" stopColor="#10B981" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="calorieLineGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#34D399" />
                          <stop offset="100%" stopColor="#10B981" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.5} vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="#4B5563"
                        tick={{ fill: '#6B7280', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        interval={showMonthTicks ? Math.max(1, Math.floor(dayCount / 8)) : 'preserveStartEnd'}
                        minTickGap={20}
                      />
                      <YAxis
                        stroke="#4B5563"
                        tick={{ fill: '#6B7280', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        domain={[0, 'dataMax + 200']}
                        tickFormatter={(value: number) => `${Math.round(value)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(17, 24, 39, 0.95)',
                          border: '1px solid #374151',
                          borderRadius: '12px',
                          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                          padding: '12px 16px',
                        }}
                        labelStyle={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}
                        itemStyle={{ color: '#10B981', fontWeight: 'bold', fontSize: 16 }}
                        formatter={(value: number | null) =>
                          value == null ? ['—', 'Calories'] : [`${value.toLocaleString()} kcal`, 'Calories']
                        }
                        labelFormatter={(label: string) => {
                          const item = chartData.find(d => d.date === label);
                          if (!item) return label;
                          const parsed = new Date(item.key + 'T00:00:00');
                          return parsed.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          });
                        }}
                        cursor={{ stroke: '#10B981', strokeWidth: 1, strokeDasharray: '5 5' }}
                      />
                      {dailyTarget != null && (
                        <ReferenceLine
                          y={dailyTarget}
                          stroke="#3B82F6"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          label={{
                            value: `Target: ${dailyTarget.toLocaleString()}`,
                            position: 'right',
                            fill: '#60A5FA',
                            fontSize: 11,
                            fontWeight: 'bold',
                          }}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="calories"
                        stroke="url(#calorieLineGradient)"
                        strokeWidth={1.5}
                        fill="url(#calorieGradient)"
                        connectNulls={false}
                        dot={false}
                        activeDot={{ r: 5, fill: '#34D399', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalorieHistoryModal;
