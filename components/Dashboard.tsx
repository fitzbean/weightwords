
import React, { useState, useEffect } from 'react';
import { UserProfile, FoodEntry, NutritionEstimate, FoodItemEstimate } from '../types';
import { estimateNutrition } from '../services/geminiService';
import { getFoodLogs, addFoodLog, deleteFoodLog, supabase } from '../services/supabaseService';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  profile: UserProfile;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ profile }) => {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [foodInput, setFoodInput] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [lastEstimate, setLastEstimate] = useState<NutritionEstimate | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadEntries();
    }
  }, [user]);

  const loadEntries = async () => {
    if (!user) return;
    const logs = await getFoodLogs(user.id, new Date());
    const entries: FoodEntry[] = logs.map(log => ({
      id: log.id,
      timestamp: log.date.getTime(),
      name: log.name,
      calories: log.calories,
      protein: log.protein,
      carbs: log.carbs,
      fat: log.fat,
    }));
    setEntries(entries);
  };

  const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);
  const caloriesRemaining = profile.dailyCalorieTarget - totalCalories;
  const progressPercent = Math.min(100, (totalCalories / profile.dailyCalorieTarget) * 100);

  const handleEstimate = async () => {
    if (!foodInput.trim()) return;
    setIsEstimating(true);
    try {
      const estimate = await estimateNutrition(foodInput);
      setLastEstimate(estimate);
    } catch (error) {
      alert("Failed to estimate calories. Please try again.");
    } finally {
      setIsEstimating(false);
    }
  };

  const addEntries = async () => {
    if (!lastEstimate || !user) return;
    
    for (const item of lastEstimate.items) {
      await addFoodLog(user.id, {
        name: item.name,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        description: foodInput,
      });
    }

    await loadEntries();
    setFoodInput('');
    setLastEstimate(null);
  };

  const deleteEntry = async (id: string) => {
    await deleteFoodLog(id);
    await loadEntries();
  };

  const data = [
    { name: 'Consumed', value: totalCalories },
    { name: 'Remaining', value: Math.max(0, caloriesRemaining) },
  ];
  const COLORS = ['#10b981', '#f3f4f6'];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">Today's Dashboard</h1>
          <p className="text-gray-400 font-bold text-sm uppercase tracking-widest mt-1">
            Goal: <span className="text-green-600">{profile.dailyCalorieTarget} kcal</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Input & AI */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-black text-gray-800 mb-4 flex items-center gap-2">
                <div className="w-2 h-6 bg-green-500 rounded-full"></div>
                Log Your Meal
            </h2>
            <div className="relative">
              <textarea
                value={foodInput}
                onChange={(e) => setFoodInput(e.target.value)}
                placeholder="Describe your meal (e.g. '3 scrambled eggs with a side of bacon and black coffee')"
                className="w-full p-6 h-32 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-green-500/10 outline-none resize-none transition-all bg-gray-50 text-gray-900 placeholder-gray-400 font-medium"
              />
              <button
                onClick={handleEstimate}
                disabled={isEstimating || !foodInput}
                className="absolute bottom-4 right-4 px-8 py-3 bg-gray-900 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50 shadow-xl shadow-gray-200 active:scale-95"
              >
                {isEstimating ? (
                   <span className="flex items-center gap-2">
                     <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                     Analyzing...
                   </span>
                ) : 'Estimate'}
              </button>
            </div>

            {lastEstimate && (
              <div className="mt-8 p-8 bg-green-50 rounded-3xl border border-green-100 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-xl font-black text-green-900 uppercase tracking-tight">Breakdown</h3>
                    <p className="text-xs font-bold text-green-600 uppercase tracking-widest mt-1">AI Detected {lastEstimate.items.length} items</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-green-900">{lastEstimate.totalCalories}</div>
                    <div className="text-[10px] font-black uppercase text-green-600 tracking-tighter">Total KCAL</div>
                  </div>
                </div>

                <div className="space-y-3 mb-8">
                  {lastEstimate.items.map((item, idx) => (
                    <div key={idx} className="bg-white/60 p-4 rounded-2xl flex justify-between items-center border border-green-100/50">
                      <div className="flex-1">
                        <p className="font-bold text-gray-800">{item.name}</p>
                        <div className="flex gap-3 mt-1">
                          <span className="text-[10px] text-gray-400 font-black">P: {item.protein}g</span>
                          <span className="text-[10px] text-gray-400 font-black">C: {item.carbs}g</span>
                          <span className="text-[10px] text-gray-400 font-black">F: {item.fat}g</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-gray-800">{item.calories}</span>
                        <span className="text-[10px] font-black text-gray-400 uppercase ml-1">kcal</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={addEntries}
                        className="flex-1 py-4 bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-green-700 shadow-xl shadow-green-200 transition-all active:scale-95"
                    >
                        Confirm {lastEstimate.items.length > 1 ? 'all items' : 'entry'}
                    </button>
                    <button
                        onClick={() => setLastEstimate(null)}
                        className="px-6 py-4 bg-white text-gray-500 rounded-2xl font-bold border border-green-100 hover:bg-gray-50 transition-all"
                    >
                        Discard
                    </button>
                </div>
              </div>
            )}
          </div>
          
          {/* AI Tip moved to left column bottom for balance */}
          <div className="bg-gradient-to-br from-green-600 to-green-800 p-8 rounded-3xl shadow-2xl text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-700">
                <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 20 20"><path d="M11 17a1 1 0 001.447.894l4-2A1 1 0 0017 15V9.236a1 1 0 00-1.447-.894l-4 2a1 1 0 00-.553.894V17zM15.211 6.276a1 1 0 000-1.788l-4.764-2.382a1 1 0 00-.894 0L4.789 4.488a1 1 0 000 1.788l4.764 2.382a1 1 0 00.894 0l4.764-2.382zM4.447 8.342A1 1 0 003 9.236V15a1 1 0 00.553.894l4 2A1 1 0 009 17v-5.764a1 1 0 00-.553-.894l-4-2z"></path></svg>
            </div>
            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                   <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-md">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                   </div>
                   <h3 className="font-black text-lg tracking-tight">AI Health Tip</h3>
                </div>
                <p className="text-green-50 text-sm leading-relaxed font-bold opacity-90">
                  Stay focused on your journey! Consistency in logging every snack and meal is the key to mastering your nutrition goals.
                </p>
            </div>
          </div>
        </div>

        {/* Right Column: Visual Progress & Daily Log */}
        <div className="space-y-6">
          {/* Calorie Progress */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-black text-gray-800 mb-2">Calorie Progress</h2>
            <div className="h-64 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={90}
                            paddingAngle={8}
                            dataKey="value"
                            startAngle={90}
                            endAngle={450}
                            stroke="none"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={10} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-4xl font-black text-gray-900">{totalCalories}</span>
                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest mt-1">Eaten Today</span>
                </div>
            </div>
            
            <div className="mt-6 space-y-4">
                <div className="flex justify-between items-end">
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                        <p className={`text-lg font-black ${caloriesRemaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {caloriesRemaining < 0 ? 'Surplus' : 'On Track'}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Remaining</p>
                        <p className="text-lg font-black text-gray-800">
                            {Math.round(Math.abs(caloriesRemaining))} <span className="text-xs">kcal</span>
                        </p>
                    </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                        className={`h-full transition-all duration-1000 ease-out rounded-full ${caloriesRemaining < 0 ? 'bg-red-500' : 'bg-green-500'}`}
                        style={{ width: `${progressPercent}%` }}
                    ></div>
                </div>
            </div>
          </div>

          {/* Daily Log - Now after Calorie Progress */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
             <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                <h2 className="text-lg font-black text-gray-800">Daily Log</h2>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{entries.length} Items</span>
             </div>
             <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
                {entries.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-gray-300 text-sm font-bold italic">No meals logged today.</p>
                  </div>
                ) : (
                  entries.map((entry) => (
                    <div key={entry.id} className="p-4 flex justify-between items-center group hover:bg-gray-50 transition-all">
                      <div className="flex gap-3 items-center">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 text-xs font-black group-hover:bg-white group-hover:text-green-600 transition-all shrink-0">
                            {entry.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-800 text-sm truncate">{entry.name}</p>
                          <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-0.5">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right shrink-0">
                            <span className="font-black text-gray-800 text-sm">{entry.calories}</span>
                            <span className="text-[8px] font-black text-gray-400 uppercase ml-0.5">kcal</span>
                        </div>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          className="p-1.5 text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 rounded-md"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
