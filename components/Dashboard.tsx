
import React, { useState, useEffect } from 'react';
import { UserProfile, FoodEntry, NutritionEstimate, FoodItemEstimate, FavoritedBreakdown } from '../types';
import { estimateNutrition } from '../services/geminiService';
import { getFoodLogs, addFoodLog, deleteFoodLog, supabase, getFavoritedBreakdowns, addFavoritedBreakdown, deleteFavoritedBreakdown } from '../services/supabaseService';
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
  const [favoritedBreakdowns, setFavoritedBreakdowns] = useState<FavoritedBreakdown[]>([]);

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
      loadFavoritedBreakdowns();
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

  const loadFavoritedBreakdowns = async () => {
    if (!user) return;
    const favorites = await getFavoritedBreakdowns(user.id);
    setFavoritedBreakdowns(favorites);
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

  const favoriteBreakdown = async () => {
    if (!lastEstimate || !user) return;
    
    const favorite: Omit<FavoritedBreakdown, 'id' | 'createdAt'> = {
      name: foodInput.slice(0, 50) + (foodInput.length > 50 ? '...' : ''),
      breakdown: lastEstimate.items,
      totalCalories: lastEstimate.totalCalories,
    };
    
    await addFavoritedBreakdown(user.id, favorite);
    await loadFavoritedBreakdowns();
  };

  const useFavoritedBreakdown = (favorite: FavoritedBreakdown) => {
    setLastEstimate({
      items: favorite.breakdown,
      totalCalories: favorite.totalCalories,
      confidence: 1,
    });
    setFoodInput(favorite.name);
  };

  const handleDeleteFavorite = async (id: string) => {
    await deleteFavoritedBreakdown(id);
    await loadFavoritedBreakdowns();
  };

  const data = [
    { name: 'Consumed', value: totalCalories },
    { name: 'Remaining', value: Math.max(0, caloriesRemaining) },
  ];
  const COLORS = ['#10b981', '#374151'];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Input & AI */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-700">
            <h2 className="text-xl font-black text-gray-100 mb-4 flex items-center gap-2">
                <div className="w-2 h-6 bg-green-500 rounded-full"></div>
                Log Your Meal
            </h2>
            <div className="relative">
              <textarea
                value={foodInput}
                onChange={(e) => setFoodInput(e.target.value)}
                placeholder="Describe your meal (e.g. '3 scrambled eggs with a side of bacon and black coffee')"
                className="w-full p-6 h-32 border border-gray-600 rounded-2xl focus:ring-4 focus:ring-green-500/10 outline-none resize-none transition-all bg-gray-700 text-gray-100 placeholder-gray-500 font-medium"
              />
              <button
                onClick={handleEstimate}
                disabled={isEstimating || !foodInput}
                className="absolute bottom-4 right-4 px-8 py-3 bg-gray-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-gray-500 transition-all disabled:opacity-50 shadow-xl shadow-black/50 active:scale-95"
              >
                {isEstimating ? (
                   <span className="flex items-center gap-2">
                     <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                     Analyzing...
                   </span>
                ) : 'Estimate'}
              </button>
            </div>

            {/* Favorited Breakdowns */}
            {favoritedBreakdowns.length > 0 && (
              <div className="mt-6">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Quick Add</p>
                <div className="flex flex-wrap gap-2">
                  {favoritedBreakdowns.slice(0, 6).map((favorite) => (
                    <div
                      key={favorite.id}
                      className="relative group"
                    >
                      <button
                        onClick={() => useFavoritedBreakdown(favorite)}
                        className="px-4 py-2 pr-10 bg-gray-700 text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-600 transition-all border border-gray-600 hover:border-green-500/50"
                      >
                        <span className="group-hover:text-green-400 transition-colors">{favorite.name}</span>
                        <span className="text-xs text-gray-500 ml-2">({favorite.totalCalories} kcal)</span>
                      </button>
                      <button
                        onClick={() => handleDeleteFavorite(favorite.id)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-900/20"
                        title="Remove from favorites"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lastEstimate && (
              <div className="mt-8 p-8 bg-green-900/20 rounded-3xl border border-green-800 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-xl font-black text-green-400 uppercase tracking-tight">Breakdown</h3>
                    <p className="text-xs font-bold text-green-500 uppercase tracking-widest mt-1">AI Detected {lastEstimate.items.length} items</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={favoriteBreakdown}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors group"
                      title="Save to favorites"
                    >
                      <svg className="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                      </svg>
                    </button>
                    <div className="text-right">
                      <div className="text-2xl font-black text-green-400">{lastEstimate.totalCalories}</div>
                      <div className="text-[10px] font-black uppercase text-green-500 tracking-tighter">Total KCAL</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-8">
                  {lastEstimate.items.map((item, idx) => (
                    <div key={idx} className="bg-gray-800/60 p-4 rounded-2xl flex justify-between items-center border border-green-800/50">
                      <div className="flex-1">
                        <p className="font-bold text-gray-100">{item.name}</p>
                        <div className="flex gap-3 mt-1">
                          <span className="text-[10px] text-gray-500 font-black">P: {item.protein}g</span>
                          <span className="text-[10px] text-gray-500 font-black">C: {item.carbs}g</span>
                          <span className="text-[10px] text-gray-500 font-black">F: {item.fat}g</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-gray-100">{item.calories}</span>
                        <span className="text-[10px] font-black text-gray-500 uppercase ml-1">kcal</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={addEntries}
                        className="flex-1 py-4 bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-green-700 shadow-xl shadow-black/50 transition-all active:scale-95"
                    >
                        Confirm {lastEstimate.items.length > 1 ? 'all items' : 'entry'}
                    </button>
                    <button
                        onClick={() => setLastEstimate(null)}
                        className="px-6 py-4 bg-gray-700 text-gray-300 rounded-2xl font-bold border border-gray-600 hover:bg-gray-600 transition-all"
                    >
                        Discard
                    </button>
                </div>
              </div>
            )}
          </div>

        {/* Right Column: Daily Log only */}
        <div className="space-y-6">
          {/* Daily Log - Now after Calorie Progress */}
          <div className="bg-gray-800 rounded-3xl shadow-sm border border-gray-700 overflow-hidden">
             <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-lg font-black text-gray-100">Daily Log</h2>
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{entries.length} Items</span>
             </div>
             <div className="divide-y divide-gray-700 max-h-[400px] overflow-y-auto">
                {entries.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-gray-600 text-sm font-bold italic">No meals logged today.</p>
                  </div>
                ) : (
                  entries.map((entry) => (
                    <div key={entry.id} className="p-4 flex justify-between items-center group hover:bg-gray-700 transition-all">
                      <div className="flex gap-3 items-center">
                        <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-gray-500 text-xs font-black group-hover:bg-gray-600 group-hover:text-green-400 transition-all shrink-0">
                            {entry.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-100 text-sm truncate">{entry.name}</p>
                          <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-0.5">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right shrink-0">
                            <span className="font-black text-gray-100 text-sm">{entry.calories}</span>
                            <span className="text-[8px] font-black text-gray-500 uppercase ml-0.5">kcal</span>
                        </div>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          className="p-1.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-900/20 rounded-md"
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

      {/* Calorie Progress - Above AI Health Tip */}
      <div className="bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-700">
        <h2 className="text-xl font-black text-gray-100 mb-2">Calorie Progress</h2>
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
                <span className="text-4xl font-black text-gray-100">{totalCalories}</span>
                <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-1">Eaten Today</span>
            </div>
        </div>
        
        <div className="mt-6 space-y-4">
            <div className="flex justify-between items-end">
                <div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Status</p>
                    <p className={`text-lg font-black ${caloriesRemaining < 0 ? 'text-red-400' : 'text-green-500'}`}>
                        {caloriesRemaining < 0 ? 'Surplus' : 'On Track'}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Remaining</p>
                    <p className="text-lg font-black text-gray-100">
                        {Math.round(Math.abs(caloriesRemaining))} <span className="text-xs">kcal</span>
                    </p>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">
                        {Math.round((caloriesRemaining / profile.dailyCalorieTarget) * 100)}%
                    </p>
                </div>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                    className={`h-full transition-all duration-1000 ease-out rounded-full ${caloriesRemaining < 0 ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${progressPercent}%` }}
                ></div>
            </div>
        </div>
      </div>

      {/* AI Health Tip - Moved to bottom for mobile */}
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
    </div>
  );
};

export default Dashboard;
