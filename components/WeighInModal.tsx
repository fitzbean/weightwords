import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';
import { WeighIn, UserProfile, Gender, WeightGoal } from '../types';
import { getWeighIns, addWeighIn, deleteWeighIn } from '../services/supabaseService';

interface WeighInModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  profile: UserProfile | null;
}

const WeighInModal: React.FC<WeighInModalProps> = ({ isOpen, onClose, userId, profile }) => {
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);
  const [newWeight, setNewWeight] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && userId) {
      loadWeighIns();
    }
  }, [isOpen, userId]);

  const loadWeighIns = async () => {
    const data = await getWeighIns(userId);
    setWeighIns(data);
  };

  const handleAddWeighIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWeight || !userId) return;

    setIsLoading(true);
    setError('');

    const weight = parseFloat(newWeight);
    if (isNaN(weight) || weight <= 0) {
      setError('Please enter a valid weight');
      setIsLoading(false);
      return;
    }

    const result = await addWeighIn(userId, weight, selectedDate);
    
    if (result.error) {
      setError(result.error.message || 'Failed to add weigh-in');
    } else {
      setNewWeight('');
      setSelectedDate(new Date().toISOString().split('T')[0]);
      await loadWeighIns();
    }
    
    setIsLoading(false);
  };

  const handleDeleteWeighIn = async (id: string) => {
    const result = await deleteWeighIn(id);
    if (result.error) {
      setError(result.error.message || 'Failed to delete weigh-in');
    } else {
      await loadWeighIns();
    }
  };

  const chartData = weighIns.map(wi => ({
    date: new Date(wi.date + 'T00:00:00').toLocaleDateString(),
    weight: wi.weightLbs,
    fullDate: wi.date,
  }));

  const getWeightChange = () => {
    if (weighIns.length < 2) return null;
    const latest = weighIns[weighIns.length - 1];
    const previous = weighIns[weighIns.length - 2];
    const change = latest.weightLbs - previous.weightLbs;
    return change;
  };

  const getDaySuffix = (day: number) => {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  const formatDateWithSuffix = (date: Date) => {
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month} ${day}${getDaySuffix(day)}, ${year}`;
  };

  const weightChange = getWeightChange();

  const calculateIdealWeight = (prof: UserProfile | null): number | null => {
    if (!prof) return null;
    const { gender, heightFt, heightIn } = prof;
    const totalHeightInches = heightFt * 12 + heightIn;
    
    // Miller's Formula (1983)
    // Men: IBW = 56.2 kg + 1.41 kg for each inch over 5 feet
    // Women: IBW = 53.1 kg + 1.36 kg for each inch over 5 feet
    // 1 kg = 2.20462 lbs
    
    if (totalHeightInches < 60) return null; // Formula is for 5ft+

    const inchesOver5ft = totalHeightInches - 60;
    let baseKg = gender === Gender.MALE ? 56.2 : 53.1;
    let kgPerInch = gender === Gender.MALE ? 1.41 : 1.36;
    const idealKg = baseKg + (kgPerInch * inchesOver5ft);
    return Math.round(idealKg * 2.20462);
  };

  const idealWeight = calculateIdealWeight(profile);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 pb-0">
          <h2 className="text-2xl font-black text-gray-100 mb-4">Weigh-ins</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">

        {weighIns.length > 0 && (
          <div className="mb-8">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gradient-to-br from-green-900/40 to-green-900/20 rounded-2xl p-4 border border-green-800/30">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                    </svg>
                  </div>
                </div>
                <p className="text-[10px] font-bold text-green-400/70 uppercase tracking-wider">Current</p>
                <p className="text-1xl font-black text-green-400">
                  {weighIns[weighIns.length - 1].weightLbs}<span className="text-sm ml-1 font-bold text-green-400/60">lbs</span>
                </p>
              </div>
              {weightChange !== null && (
                <div className={`bg-gradient-to-br ${weightChange >= 0 ? 'from-red-900/40 to-red-900/20 border-red-800/30' : 'from-emerald-900/40 to-emerald-900/20 border-emerald-800/30'} rounded-2xl p-4 border`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-8 h-8 ${weightChange >= 0 ? 'bg-red-500/20' : 'bg-emerald-500/20'} rounded-lg flex items-center justify-center`}>
                      <svg className={`w-4 h-4 ${weightChange >= 0 ? 'text-red-400' : 'text-emerald-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                          d={weightChange >= 0 ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"} />
                      </svg>
                    </div>
                  </div>
                  <p className={`text-[10px] font-bold ${weightChange >= 0 ? 'text-red-400/70' : 'text-emerald-400/70'} uppercase tracking-wider`}>Last</p>
                  <p className={`text-2xl font-black ${weightChange >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {weightChange >= 0 ? '+' : ''}{Math.abs(weightChange).toFixed(1)}<span className="text-sm ml-1 font-bold opacity-60">lbs</span>
                  </p>
                </div>
              )}
              {profile?.targetWeightLbs ? (() => {
                const currentWeight = weighIns[weighIns.length - 1].weightLbs;
                const targetWeight = profile.targetWeightLbs;
                const remaining = currentWeight - targetWeight;
                const isAboveTarget = remaining > 0;
                return (
                  <div className={`bg-gradient-to-br ${isAboveTarget ? 'from-blue-900/40 to-blue-900/20 border-blue-800/30' : 'from-amber-900/40 to-amber-900/20 border-amber-800/30'} rounded-2xl p-4 border`}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-8 h-8 ${isAboveTarget ? 'bg-blue-500/20' : 'bg-amber-500/20'} rounded-lg flex items-center justify-center`}>
                        <svg className={`w-4 h-4 ${isAboveTarget ? 'text-blue-400' : 'text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                      </div>
                    </div>
                    <p className={`text-[10px] font-bold ${isAboveTarget ? 'text-blue-400/70' : 'text-amber-400/70'} uppercase tracking-wider`}>To Target</p>
                    <p className={`text-1xl font-black ${isAboveTarget ? 'text-blue-400' : 'text-amber-400'}`}>
                      {isAboveTarget ? '-' : '+'}{Math.abs(remaining).toFixed(1)}<span className="text-sm ml-1 font-bold opacity-60">lbs</span>
                    </p>
                  </div>
                );
              })() : (
                <div className="bg-gradient-to-br from-purple-900/40 to-purple-900/20 rounded-2xl p-4 border border-purple-800/30">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-purple-400/70 uppercase tracking-wider">Entries</p>
                  <p className="text-2xl font-black text-purple-400">{weighIns.length}</p>
                </div>
              )}
            </div>

            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-5 border border-gray-700/50 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Weight History</h4>
                <div className="flex items-center gap-2">
                  {weighIns.length >= 2 && (() => {
                    const totalChange = weighIns[weighIns.length - 1].weightLbs - weighIns[0].weightLbs;
                    return (
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                        totalChange <= 0 
                          ? 'bg-green-900/30 text-green-400' 
                          : 'bg-red-900/30 text-red-400'
                      }`}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                            d={totalChange <= 0 
                              ? "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" 
                              : "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"} 
                          />
                        </svg>
                        <span className="text-[8px] sm:text-[9px] opacity-70 mr-0.5">total</span>
                        {Math.abs(totalChange).toFixed(1)}
                        <span className="text-[8px] sm:text-[9px] opacity-70 mr-0.5">lbs</span>
                      </div>
                    );
                  })()}
                  {weightChange !== null && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                      weightChange <= 0 
                        ? 'bg-green-900/30 text-green-400' 
                        : 'bg-red-900/30 text-red-400'
                    }`}>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                          d={weightChange <= 0 
                            ? "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" 
                            : "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"} 
                        />
                      </svg>
                        <span className="text-[8px] sm:text-[9px] opacity-70 mr-0.5">last</span>
                        {Math.abs(weightChange).toFixed(1)}
                        <span className="text-[8px] sm:text-[9px] opacity-70 mr-0.5">lbs</span>
                    </div>
                  )}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -30, bottom: 0}}>
                  <defs>
                    <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="50%" stopColor="#10B981" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
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
                  />
                  <YAxis 
                    stroke="#4B5563"
                    tick={{ fill: '#6B7280', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    domain={['dataMin - 3', 'dataMax + 3']}
                    tickFormatter={(value) => `${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(17, 24, 39, 0.95)', 
                      border: '1px solid #374151',
                      borderRadius: '12px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                      padding: '12px 16px'
                    }}
                    labelStyle={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}
                    itemStyle={{ color: '#10B981', fontWeight: 'bold', fontSize: 16 }}
                    formatter={(value: number) => [`${value} lbs`, 'Weight']}
                    cursor={{ stroke: '#10B981', strokeWidth: 1, strokeDasharray: '5 5' }}
                  />
                  {profile?.targetWeightLbs && (
                    <ReferenceLine 
                      y={profile.targetWeightLbs} 
                      stroke="#3B82F6" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{ 
                        value: `Target: ${profile.targetWeightLbs} lbs`, 
                        position: 'right',
                        fill: '#60A5FA',
                        fontSize: 11,
                        fontWeight: 'bold'
                      }}
                    />
                  )}
                  <Area 
                    type="monotone" 
                    dataKey="weight" 
                    stroke="url(#lineGradient)"
                    strokeWidth={3}
                    fill="url(#weightGradient)"
                    dot={{ fill: '#10B981', stroke: '#064E3B', strokeWidth: 2, r: 5 }}
                    activeDot={{ r: 8, fill: '#34D399', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <form onSubmit={handleAddWeighIn} className="mb-6">
          {profile?.targetWeightLbs && weighIns.length > 0 && (() => {
            const currentWeight = weighIns[weighIns.length - 1].weightLbs;
            const targetWeight = profile.targetWeightLbs;
            const remaining = currentWeight - targetWeight;
            const isAboveTarget = remaining > 0;
            const percentProgress = weighIns.length >= 2 
              ? ((weighIns[0].weightLbs - currentWeight) / (weighIns[0].weightLbs - targetWeight)) * 100
              : 0;
            
            // Calculate projections
            const getProjections = () => {
              if (weighIns.length < 2) return null;
              
              const firstWeighIn = weighIns[0];
              const latestWeighIn = weighIns[weighIns.length - 1];
              const diffLbs = firstWeighIn.weightLbs - latestWeighIn.weightLbs;
              const remainingLbs = latestWeighIn.weightLbs - targetWeight;
              
              if (remainingLbs <= 0) return null;

              const formatDuration = (targetDate: Date) => {
                const now = new Date();
                const diffTime = targetDate.getTime() - now.getTime();
                const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (totalDays <= 0) return '';
                
                const months = Math.floor(totalDays / 30);
                const remainingDays = totalDays % 30;
                
                let parts = [];
                if (months > 0) parts.push(`${months}m`);
                if (remainingDays > 0 || months === 0) parts.push(`${remainingDays}d`);
                
                return `(${parts.join(' ')})`;
              };

              // Current Trajectory (based on average loss per day since start)
              const firstDate = new Date(firstWeighIn.date + 'T00:00:00');
              const latestDate = new Date(latestWeighIn.date + 'T00:00:00');
              const daysPassed = Math.max(1, (latestDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
              const lbsPerDay = diffLbs / daysPassed;
              
              let trajectoryDate = null;
              let trajectoryDuration = '';
              if (lbsPerDay > 0) {
                const daysRemaining = remainingLbs / lbsPerDay;
                trajectoryDate = new Date();
                trajectoryDate.setDate(trajectoryDate.getDate() + daysRemaining);
                trajectoryDuration = formatDuration(trajectoryDate);
              }

              // Scheduled Date (based on profile weight goal)
              let scheduledDate = null;
              let scheduledDuration = '';
              let baseScheduledDate = null;
              let baseScheduledDuration = '';
              const goalMap: Record<string, number> = {
                [WeightGoal.LOSE_FAST]: 2,
                [WeightGoal.LOSE]: 1,
                [WeightGoal.MAINTAIN]: 0,
                [WeightGoal.GAIN]: -0.5,
                [WeightGoal.GAIN_FAST]: -1
              };
              const lbsPerWeek = goalMap[profile.weightGoal] || 0;
              let idealWeightDate = null;
              if (lbsPerWeek > 0) {
                // Dynamic schedule from current weight
                const weeksRemaining = remainingLbs / lbsPerWeek;
                scheduledDate = new Date();
                scheduledDate.setDate(scheduledDate.getDate() + (weeksRemaining * 7));
                scheduledDuration = formatDuration(scheduledDate);

                // Base schedule from start date and first weight
                const totalLbsToLose = firstWeighIn.weightLbs - targetWeight;
                const totalWeeksNeeded = totalLbsToLose / lbsPerWeek;
                baseScheduledDate = new Date(firstDate);
                baseScheduledDate.setDate(baseScheduledDate.getDate() + (totalWeeksNeeded * 7));
                baseScheduledDuration = formatDuration(baseScheduledDate);

                // Ideal weight projection
                if (idealWeight && currentWeight > idealWeight) {
                  const idealRemainingLbs = currentWeight - idealWeight;
                  const weeksToIdeal = idealRemainingLbs / lbsPerWeek;
                  idealWeightDate = new Date();
                  idealWeightDate.setDate(idealWeightDate.getDate() + (weeksToIdeal * 7));
                }
              }

              const daysAheadTrajectory = trajectoryDate && scheduledDate ? Math.round((scheduledDate.getTime() - trajectoryDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
              const daysAheadBase = scheduledDate && baseScheduledDate ? Math.round((baseScheduledDate.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

              return { 
                trajectoryDate, 
                trajectoryDuration, 
                scheduledDate, 
                scheduledDuration, 
                baseScheduledDate,
                baseScheduledDuration,
                daysAheadTrajectory,
                daysAheadBase,
                idealWeightDate
              };
            };

            const projections = getProjections();
            
            return (
              <div className="mb-4 p-4 bg-gradient-to-br from-blue-900/20 to-blue-900/10 border border-blue-800/30 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                    <span className="text-sm font-bold text-blue-400">Target: {targetWeight} lbs</span>
                  </div>
                  <span className={`text-sm font-bold ${isAboveTarget ? 'text-blue-400' : 'text-amber-400'}`}>
                    {isAboveTarget ? `${Math.abs(remaining).toFixed(1)} lbs to go` : `${Math.abs(remaining).toFixed(1)} lbs over`}
                  </span>
                </div>
                {weighIns.length >= 2 && percentProgress > 0 && percentProgress < 200 && (
                  <div className="mb-2">
                    <div className="w-full bg-gray-700/50 rounded-full h-2 mb-1">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-blue-400 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(Math.max(percentProgress, 0), 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      {percentProgress >= 100 ? '🎉 Target reached!' : `${percentProgress.toFixed(0)}% progress from start`}
                    </p>
                    {percentProgress < 100 && projections && (
                      <div className="mt-2 space-y-1">
                        {projections.scheduledDate && (
                          <p className="text-[10px] text-blue-400/80">
                            <p className="text-[10px] text-yellow-400/80 font-bold">Current Progress Goal</p>
                            On pace for <span className="font-bold">{formatDateWithSuffix(projections.scheduledDate)}</span> —
                            {projections.daysAheadBase !== null && projections.daysAheadBase !== 0 && (
                              <span className={`ml-1 font-black ${projections.daysAheadBase > 0 ? 'text-green-400' : 'text-amber-400'}`}>
                                {projections.daysAheadBase > 0 ? `${projections.daysAheadBase} days ahead schedule!` : `${Math.abs(projections.daysAheadBase)} days behind schedule!`}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {idealWeight && (
                  <div className="pt-2 border-t border-blue-800/20">
                    <p className="text-[10px] text-blue-400/60 font-medium">
                      <p className="text-[10px] text-yellow-400/80 font-bold">Miller's Formula (Ideal Body Weight)</p>
                      Your ideal weight is <span className="font-bold text-blue-400/80">{idealWeight} lbs</span>
                      {projections?.idealWeightDate && (
                        <> — Est. reach by <span className="font-bold text-blue-400/80">{formatDateWithSuffix(projections.idealWeightDate)}</span></>
                      )}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
          <h3 className="text-lg font-bold text-gray-100 mb-4">Add Weigh-in</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Weight (lbs)
              </label>
              <input
                type="number"
                step="0.1"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                placeholder="150.5"
                className="w-full p-3 bg-gray-700 text-gray-100 rounded-xl border border-gray-600 focus:border-green-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full p-3 bg-gray-700 text-gray-100 rounded-xl border border-gray-600 focus:border-green-500 outline-none"
                required
              />
            </div>
          </div>
          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-green-600 text-white rounded-xl font-black uppercase tracking-widest text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {isLoading ? 'Adding...' : 'Add Weigh-in'}
          </button>
        </form>

        {weighIns.length > 0 && (
          <div>
            <h3 className="text-lg font-bold text-gray-100 mb-4">History</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {weighIns.slice().reverse().map((wi) => (
                <div key={wi.id} className="flex items-center justify-between bg-gray-700 rounded-lg p-3">
                  <div>
                    <span className="text-gray-100 font-medium">{wi.weightLbs} lbs</span> 
                    <span className="text-gray-400 text-sm"> on 
                      {" " + new Date(wi.date + 'T00:00:00').toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteWeighIn(wi.id)}
                    className="p-1.5 text-gray-400 opacity-60 hover:opacity-100 transition-all rounded-md hover:bg-red-900/40"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default WeighInModal;
