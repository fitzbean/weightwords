import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
      <div className="bg-gray-800 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black text-gray-100">Weigh-ins</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {weighIns.length > 0 && (
          <div className="mb-8">
            <div className="bg-gray-700 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-gray-400 text-sm">Current</p>
                  <p className="text-2xl font-bold text-green-400">
                    {weighIns[weighIns.length - 1].weightLbs} lbs
                  </p>
                </div>
                {weightChange !== null && (
                  <div>
                    <p className="text-gray-400 text-sm">Change</p>
                    <p className={`text-2xl font-bold ${weightChange >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {weightChange >= 0 ? '+' : ''}{weightChange.toFixed(1)} lbs
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-gray-400 text-sm">Total</p>
                  <p className="text-2xl font-bold text-gray-200">{weighIns.length}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-700 rounded-xl p-4">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#9CA3AF"
                    tick={{ fill: '#9CA3AF' }}
                  />
                  <YAxis 
                    stroke="#9CA3AF"
                    tick={{ fill: '#9CA3AF' }}
                    domain={['dataMin - 5', 'dataMax + 5']}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1F2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#9CA3AF' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="weight" 
                    stroke="#10B981" 
                    strokeWidth={2}
                    dot={{ fill: '#10B981', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
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
  );
};

export default WeighInModal;
