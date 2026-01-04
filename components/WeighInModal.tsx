import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';
import { WeighIn } from '../types';
import { getWeighIns, addWeighIn, deleteWeighIn } from '../services/supabaseService';

interface WeighInModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const WeighInModal: React.FC<WeighInModalProps> = ({ isOpen, onClose, userId }) => {
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

    const result = await addWeighIn(userId, weight, new Date(selectedDate));
    
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
    if (!confirm('Are you sure you want to delete this weigh-in?')) return;
    
    const result = await deleteWeighIn(id);
    if (result.error) {
      setError(result.error.message || 'Failed to delete weigh-in');
    } else {
      await loadWeighIns();
    }
  };

  const chartData = weighIns.map(wi => ({
    date: new Date(wi.date).toLocaleDateString(),
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

  const weightChange = getWeightChange();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 pb-0">
          <h2 className="text-2xl font-black text-gray-100">Weigh-ins</h2>
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
                <p className="text-2xl font-black text-green-400">
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
                  <p className={`text-[10px] font-bold ${weightChange >= 0 ? 'text-red-400/70' : 'text-emerald-400/70'} uppercase tracking-wider`}>Last Change</p>
                  <p className={`text-2xl font-black ${weightChange >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {weightChange >= 0 ? '+' : ''}{weightChange.toFixed(1)}<span className="text-sm ml-1 font-bold opacity-60">lbs</span>
                  </p>
                </div>
              )}
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
            </div>

            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-5 border border-gray-700/50 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Weight Trend</h4>
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
                        <span className="text-[9px] opacity-70 mr-0.5">total</span>
                        {Math.abs(totalChange).toFixed(1)} lbs
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
                      <span className="text-[9px] opacity-70 mr-0.5">last</span>
                      {Math.abs(weightChange).toFixed(1)} lbs
                    </div>
                  )}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                    <p className="text-gray-100 font-medium">{wi.weightLbs} lbs</p>
                    <p className="text-gray-400 text-sm">
                      {new Date(wi.date).toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteWeighIn(wi.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
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
