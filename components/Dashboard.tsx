
import React, { useState, useEffect } from 'react';
import { UserProfile, FoodEntry, FoodLog, NutritionEstimate, FoodItemEstimate, FavoritedBreakdown } from '../types';
import { estimateNutrition } from '../services/geminiService';
import { getFoodLogs, addFoodLog, deleteFoodLog, supabase, getFavoritedBreakdowns, addFavoritedBreakdown, deleteFavoritedBreakdown, updateFavoritedBreakdown, getSharedFavoritedBreakdowns, addSpouse, removeSpouse, getWeeklyFoodLogs } from '../services/supabaseService';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { getWeekDates } from '../utils/dateUtils';
import { sttService } from '../services/sttService';

interface DashboardProps {
  profile: UserProfile;
  onLogout: () => void;
  showSpouseModal?: boolean;
  setShowSpouseModal?: (show: boolean) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ profile, showSpouseModal: externalShowSpouseModal, setShowSpouseModal: externalSetShowSpouseModal }) => {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [foodInput, setFoodInput] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [lastEstimate, setLastEstimate] = useState<NutritionEstimate | null>(null);
  const [user, setUser] = useState<any>(null);
  const [favoritedBreakdowns, setFavoritedBreakdowns] = useState<FavoritedBreakdown[]>([]);
  const [editingFavorite, setEditingFavorite] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [spouseEmail, setSpouseEmail] = useState('');
  const [spouseError, setSpouseError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weeklyData, setWeeklyData] = useState<{ date: string; totalCalories: number }[]>([]);
  const [isListening, setIsListening] = useState(false);
  
  // Use external modal state if provided, otherwise use internal state
  const showSpouseModal = externalShowSpouseModal ?? false;
  const setShowSpouseModal = externalSetShowSpouseModal ?? (() => {});

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
      loadWeeklyData();
    }
  }, [user]);

  useEffect(() => {
    if (user && profile) {
      loadEntries();
    }
  }, [profile?.timezone]);

  useEffect(() => {
    if (user && profile) {
      loadEntries();
      loadWeeklyData();
    }
  }, [selectedDate]);

  const handleToggleListening = () => {
    if (isListening) {
      sttService.stop();
      setIsListening(false);
    } else {
      sttService.start(
        (text) => {
          setFoodInput(prev => prev ? `${prev} ${text}` : text);
        },
        () => setIsListening(false),
        (error) => {
          console.error('STT error:', error);
          setIsListening(false);
          if (error !== 'no-speech') {
            alert('Speech recognition error. Please try again or type manually.');
          }
        }
      );
      setIsListening(true);
    }
  };

  const loadWeeklyData = async () => {
    if (!user) return;
    const weekDates = getWeekDates(selectedDate, profile?.timezone);
    const data = await getWeeklyFoodLogs(user.id, weekDates, profile?.timezone);
    setWeeklyData(data.map(d => ({ date: d.date, totalCalories: d.totalCalories })));
  };

  const loadEntries = async () => {
    if (!user) return;
    const logs = await getFoodLogs(user.id, selectedDate, profile?.timezone);
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
    // Use shared favorites if user has a spouse, otherwise use personal favorites
    const favorites = profile.spouseId 
      ? await getSharedFavoritedBreakdowns(user.id)
      : await getFavoritedBreakdowns(user.id);
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

  const addEntry = async () => {
    if (!user || !lastEstimate) return;

    const log: Omit<FoodLog, 'id' | 'date'> = {
      name: foodInput,
      calories: lastEstimate.totalCalories,
      protein: lastEstimate.items.reduce((sum, item) => sum + item.protein, 0),
      carbs: lastEstimate.items.reduce((sum, item) => sum + item.carbs, 0),
      fat: lastEstimate.items.reduce((sum, item) => sum + item.fat, 0),
      description: foodInput,
    };

    // Create a modified addFoodLog that accepts a specific date
    const { data, error } = await supabase
      .from('food_logs')
      .insert({
        user_id: user.id,
        name: log.name,
        calories: log.calories,
        protein: log.protein,
        carbs: log.carbs,
        fat: log.fat,
        description: log.description,
        date: profile?.timezone 
          ? new Date(selectedDate.toLocaleString("en-US", { timeZone: profile.timezone })).toISOString().split('T')[0]
          : selectedDate.toISOString().split('T')[0],
      })
      .select()
      .single();
    
    await loadEntries();
    await loadWeeklyData();
    setFoodInput('');
    setLastEstimate(null);
  };

  const deleteEntry = async (id: string) => {
    await deleteFoodLog(id);
    await loadEntries();
    await loadWeeklyData();
  };

  const favoriteBreakdown = async () => {
    if (!lastEstimate || !user) return;
    
    const favorite: Omit<FavoritedBreakdown, 'id' | 'createdAt'> = {
      name: foodInput,
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

  const handleRename = (favorite: FavoritedBreakdown) => {
    setEditingFavorite(favorite.id);
    setEditingName(''); // Start with empty field
  };

  const saveRename = async () => {
    if (!editingFavorite) return;
    
    await updateFavoritedBreakdown(editingFavorite, { name: editingName });
    await loadFavoritedBreakdowns();
    setEditingFavorite(null);
    setEditingName('');
  };

  const cancelRename = () => {
    setEditingFavorite(null);
    setEditingName('');
  };

  const handleAddSpouse = async () => {
    setSpouseError('');
    if (!spouseEmail.trim()) {
      setSpouseError('Please enter an email address');
      return;
    }
    
    const { error } = await addSpouse(user.id, spouseEmail);
    if (error) {
      setSpouseError(error.message || 'Failed to add spouse');
    } else {
      setShowSpouseModal(false);
      setSpouseEmail('');
      // Reload profile to get spouse info
      window.location.reload();
    }
  };

  const handleRemoveSpouse = async () => {
    await removeSpouse(user.id);
    window.location.reload();
  };

  const getFoodEmoji = (foodName: string): string => {
    const name = foodName.toLowerCase();
    
    // Proteins
    if (name.includes('chicken') || name.includes('turkey') || name.includes('breast')) return '🍗';
    if (name.includes('beef') || name.includes('steak') || name.includes('burger')) return '🥩';
    if (name.includes('fish') || name.includes('salmon') || name.includes('tuna')) return '🐟';
    if (name.includes('egg') || name.includes('scrambled')) return '🥚';
    if (name.includes('protein') || name.includes('shake')) return '🥤';
    if (name.includes('bacon') || name.includes('sausage')) return '🥓';
    if (name.includes('pork')) return '🍖';
    
    // Dairy
    if (name.includes('milk') || name.includes('cheese') || name.includes('yogurt')) return '🥛';
    if (name.includes('butter')) return '🧈';
    
    // Grains/Carbs
    if (name.includes('bread') || name.includes('toast') || name.includes('sandwich')) return '🍞';
    if (name.includes('rice')) return '🍚';
    if (name.includes('pasta') || name.includes('noodle') || name.includes('spaghetti')) return '🍝';
    if (name.includes('potato') || name.includes('fries')) return '🍟';
    if (name.includes('oatmeal') || name.includes('cereal')) return '🥣';
    if (name.includes('pizza')) return '🍕';
    if (name.includes('bagel')) return '🥯';
    
    // Fruits
    if (name.includes('apple')) return '🍎';
    if (name.includes('banana')) return '🍌';
    if (name.includes('orange') || name.includes('citrus')) return '🍊';
    if (name.includes('berry') || name.includes('strawberry') || name.includes('blueberry')) return '🍓';
    if (name.includes('grape')) return '🍇';
    if (name.includes('watermelon')) return '🍉';
    if (name.includes('fruit') || name.includes('smoothie')) return '🥝';
    
    // Vegetables
    if (name.includes('salad') || name.includes('lettuce') || name.includes('greens')) return '🥗';
    if (name.includes('broccoli') || name.includes('cauliflower')) return '🥦';
    if (name.includes('carrot')) return '🥕';
    if (name.includes('tomato')) return '🍅';
    if (name.includes('corn')) return '🌽';
    if (name.includes('pepper') || name.includes('bell')) return '🫑';
    if (name.includes('avocado')) return '🥑';
    if (name.includes('mushroom')) return '🍄';
    if (name.includes('onion')) return '🧅';
    if (name.includes('garlic')) return '🧄';
    if (name.includes('vegetable') || name.includes('veggie')) return '🥬';
    
    // Snacks & Sweets
    if (name.includes('cookie') || name.includes('cake') || name.includes('dessert')) return '🍪';
    if (name.includes('chocolate') || name.includes('candy')) return '🍫';
    if (name.includes('ice cream')) return '🍦';
    if (name.includes('chip') || name.includes('cracker')) return '🍿';
    if (name.includes('popcorn')) return '🍿';
    if (name.includes('nuts') || name.includes('almond')) return '🥜';
    if (name.includes('granola') || name.includes('bar')) return '🍫';
    
    // Beverages
    if (name.includes('coffee')) return '☕';
    if (name.includes('tea')) return '🍵';
    if (name.includes('juice')) return '🧃';
    if (name.includes('water') || name.includes('hydrat')) return '💧';
    if (name.includes('soda') || name.includes('coke')) return '🥤';
    
    // Soups
    if (name.includes('soup') || name.includes('stew')) return '🍲';
    
    // Mexican/International
    if (name.includes('taco') || name.includes('burrito') || name.includes('quesadilla')) return '🌮';
    if (name.includes('sushi')) return '🍱';
    if (name.includes('ramen')) return '🍜';
    
    // Default
    return '🍽️';
  };

  const getHealthColor = (foodName: string, calories: number, protein: number): string => {
    const name = foodName.toLowerCase();
    
    // Excellent (green) - Vegetables, fruits, lean proteins, water
    if (
      name.includes('salad') || name.includes('lettuce') || name.includes('greens') ||
      name.includes('broccoli') || name.includes('cauliflower') || name.includes('spinach') ||
      name.includes('vegetable') || name.includes('veggie') ||
      name.includes('fruit') || name.includes('apple') || name.includes('berry') ||
      name.includes('chicken breast') || name.includes('turkey') || name.includes('fish') ||
      name.includes('salmon') || name.includes('tuna') || name.includes('egg white') ||
      name.includes('water') || name.includes('hydrat')
    ) {
      return 'bg-green-900/30';
    }
    
    // Good (blue-green) - Most fruits, whole grains, lean proteins
    if (
      name.includes('apple') || name.includes('banana') || name.includes('orange') ||
      name.includes('oatmeal') || name.includes('quinoa') || name.includes('brown rice') ||
      name.includes('chicken') || name.includes('greek yogurt') || name.includes('beans') ||
      name.includes('lentils') || name.includes('nuts') || name.includes('avocado') ||
      protein > 20 && calories < 300 // High protein, low calorie
    ) {
      return 'bg-teal-900/30';
    }
    
    // Moderate (yellow) - Regular grains, dairy, some proteins
    if (
      name.includes('bread') || name.includes('pasta') || name.includes('rice') ||
      name.includes('milk') || name.includes('cheese') || name.includes('yogurt') ||
      name.includes('potato') || name.includes('beef') || name.includes('pork') ||
      name.includes('egg') || name.includes('protein shake')
    ) {
      return 'bg-yellow-900/30';
    }
    
    // Less ideal (orange) - Processed foods, fried foods
    if (
      name.includes('pizza') || name.includes('burger') || name.includes('fries') ||
      name.includes('chip') || name.includes('cracker') || name.includes('granola') ||
      name.includes('juice') || name.includes('soda') || name.includes('beer') ||
      calories > 500 && protein < 20 // High calorie, low protein
    ) {
      return 'bg-orange-900/30';
    }
    
    // Limited (red) - Desserts, sweets, highly processed
    if (
      name.includes('cookie') || name.includes('cake') || name.includes('dessert') ||
      name.includes('chocolate') || name.includes('candy') || name.includes('ice cream') ||
      name.includes('bacon') || name.includes('sausage') || name.includes('donut') ||
      calories > 600 // Very high calorie
    ) {
      return 'bg-red-900/30';
    }
    
    // Default neutral
    return 'bg-gray-700';
  };

  const data = [
    { name: 'Consumed', value: totalCalories },
    { name: 'Remaining', value: Math.max(0, caloriesRemaining) },
  ];
  const COLORS = ['#10b981', '#374151'];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
        {/* Left Column: Input & AI */}
        <div className="lg:col-span-2 flex flex-col">
          <div className="bg-gray-800 p-3 rounded-3xl shadow-sm border border-gray-700">
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
              <div className="absolute bottom-4 right-4 flex items-center gap-2">
                {sttService.isSupported() && (
                  <button
                    onClick={handleToggleListening}
                    className={`p-3 rounded-xl transition-all shadow-xl shadow-black/50 active:scale-95 ${
                      isListening 
                        ? 'bg-red-500 text-white animate-pulse' 
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                    title={isListening ? 'Stop listening' : 'Speak to log'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {isListening ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h6a1 1 0 110 2h-6a1 1 0 01-1-1z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      )}
                    </svg>
                  </button>
                )}
                <button
                  onClick={handleEstimate}
                  disabled={isEstimating || !foodInput}
                  className="px-8 py-3 bg-gray-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-gray-500 transition-all disabled:opacity-50 shadow-xl shadow-black/50 active:scale-95"
                >
                  {isEstimating ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Analyzing...
                    </span>
                  ) : 'Estimate'}
                </button>
              </div>
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
                      {editingFavorite === favorite.id ? (
                        <div className="flex items-center gap-1 px-3 py-2 bg-gray-700 rounded-xl border border-gray-600">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename();
                              if (e.key === 'Escape') cancelRename();
                            }}
                            className="bg-gray-600 text-gray-100 px-2 py-1 rounded text-sm w-32 outline-none"
                            autoFocus
                          />
                          <button
                            onClick={saveRename}
                            className="p-1 text-green-400 hover:text-green-300"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                          </button>
                          <button
                            onClick={cancelRename}
                            className="p-1 text-gray-400 hover:text-gray-300"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => useFavoritedBreakdown(favorite)}
                            className="px-4 py-2 pr-16 bg-gray-700 text-gray-300 rounded-xl text-sm font-medium transition-all border border-gray-600 active:scale-95 active:bg-gray-500"
                          >
                            <span className="text-gray-300">{favorite.name}</span>
                            <span className="text-xs text-gray-500 ml-2">({favorite.totalCalories} kcal)</span>
                          </button>
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                            <button
                              onClick={() => handleRename(favorite)}
                              className="p-1 text-gray-400 sm:opacity-0 sm:group-hover:opacity-60 transition-all rounded-md hover:bg-gray-600"
                              title="Rename favorite"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteFavorite(favorite.id)}
                              className="p-1 text-gray-400 sm:opacity-0 sm:group-hover:opacity-60 transition-all rounded-md hover:bg-red-900/40"
                              title="Remove from favorites"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path>
                              </svg>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lastEstimate && (
              <div className="mt-8 p-4 bg-green-900/20 rounded-3xl border border-green-800 animate-in fade-in zoom-in-95 duration-300">
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
                        onClick={addEntry}
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

          {/* Calorie Progress - Under Log Your Meal */}
          <div className="mt-6 lg:mt-8 bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-700">
            <h2 className="text-base font-black text-gray-100 mb-3">Calorie Progress</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Consumed</p>
                  <p className="text-2xl font-black text-gray-100">{totalCalories}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Target</p>
                  <p className="text-2xl font-black text-gray-100">{profile.dailyCalorieTarget}</p>
                </div>
              </div>
              
              <div className="relative">
                <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ease-out rounded-full ${caloriesRemaining < 0 ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(100, progressPercent)}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <div>
                  <p className={`text-xs font-black ${caloriesRemaining < 0 ? 'text-red-400' : 'text-green-500'}`}>
                    {caloriesRemaining < 0 ? 'Over by' : 'Remaining'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-gray-100">
                    {Math.round(Math.abs(caloriesRemaining))} kcal
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Weekly Calorie Tracker */}
          <div className="mt-6 lg:mt-8 bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-700">
            <h2 className="text-base font-black text-gray-100 mb-3">Weekly Progress</h2>
            <div className="space-y-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
                const dayData = weeklyData[index];
                const isToday = selectedDate.toDateString() === new Date().toDateString() && 
                               new Date(selectedDate).getDay() === (index === 6 ? 0 : index + 1);
                const calories = dayData?.totalCalories || 0;
                const percent = Math.min(100, (calories / (profile?.dailyCalorieTarget || 2000)) * 100);
                
                return (
                  <div key={day} className="flex items-center gap-3">
                    <span className={`text-xs font-black w-8 ${isToday ? 'text-green-500' : 'text-gray-500'}`}>
                      {day}
                    </span>
                    <div className="flex-1 relative">
                      <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ease-out rounded-full ${
                            calories > (profile?.dailyCalorieTarget || 2000) 
                              ? 'bg-red-500' 
                              : isToday 
                                ? 'bg-green-500' 
                                : 'bg-blue-500'
                          }`}
                          style={{ width: `${Math.min(100, percent)}%` }}
                        ></div>
                      </div>
                    </div>
                    <span className={`text-xs font-black text-right w-12 ${isToday ? 'text-green-500' : 'text-gray-400'}`}>
                      {calories}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
              {(() => {
                const currentDayOfWeek = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
                const todayIndex = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1; // Convert to 0-6 (Mon-Sun)
                const daysBeforeToday = todayIndex; // Number of days before today
                const weeklyTotalBeforeToday = weeklyData.slice(0, todayIndex).reduce((sum, day) => sum + day.totalCalories, 0);
                const weeklyTargetBeforeToday = (profile?.dailyCalorieTarget || 2000) * daysBeforeToday;
                const weeklyVariance = weeklyTotalBeforeToday - weeklyTargetBeforeToday;
                const weeklyVariancePercent = daysBeforeToday > 0 ? Math.round((weeklyVariance / weeklyTargetBeforeToday) * 100) : 0;
                const weeklyTotalSoFar = weeklyData.reduce((sum, day) => sum + day.totalCalories, 0);
                
                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-gray-500 uppercase tracking-wider">Weekly Total</span>
                      <span className="text-sm font-black text-gray-100">
                        {weeklyTotalSoFar} / {(profile?.dailyCalorieTarget || 2000) * (todayIndex + 1)} kcal
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-gray-500 uppercase tracking-wider">Surplus / Deficit</span>
                      <span className={`text-sm font-black ${
                        weeklyTotalSoFar > (profile?.dailyCalorieTarget || 2000) * (todayIndex + 1) ? 'text-red-400' : 'text-green-500'
                      }`}>
                        {(() => {
                          const totalVariance = weeklyTotalSoFar - ((profile?.dailyCalorieTarget || 2000) * (todayIndex + 1));
                          const totalVariancePercent = Math.round((totalVariance / ((profile?.dailyCalorieTarget || 2000) * (todayIndex + 1))) * 100);
                          // Debug: uncomment to see values
                          // console.log('weeklyTotalSoFar:', weeklyTotalSoFar, 'targetSoFar:', (profile?.dailyCalorieTarget || 2000) * (todayIndex + 1), 'variance:', totalVariance, 'percent:', totalVariancePercent);
                          return totalVariance > 0 
                            ? `+${totalVariancePercent}%`
                            : `${totalVariancePercent}%`;
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs font-black text-gray-500 uppercase tracking-wider">Daily Avg</span>
                      <span className="text-sm font-black text-gray-100">
                        {Math.round(weeklyTotalSoFar / Math.max(1, todayIndex + 1))} kcal
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-300 mt-2 italic">Above metrics consider the total calories consumed so far this week</p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Right Column: Daily Log only */}
        <div className="flex flex-col">
          <div className="bg-gray-800 rounded-3xl shadow-sm border border-gray-700 overflow-hidden flex-1 flex flex-col">
             <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-black text-gray-100">Daily Log</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => {
                        const newDate = new Date(selectedDate);
                        newDate.setDate(newDate.getDate() - 1);
                        setSelectedDate(newDate);
                      }}
                      className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-wider">
                      {selectedDate.toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric',
                        timeZone: profile?.timezone || 'UTC'
                      })}
                    </p>
                    <button
                      onClick={() => {
                        const newDate = new Date(selectedDate);
                        newDate.setDate(newDate.getDate() + 1);
                        setSelectedDate(newDate);
                      }}
                      className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
                      disabled={selectedDate.toDateString() === new Date().toDateString()}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    {selectedDate.toDateString() !== new Date().toDateString() && (
                      <button
                        onClick={() => setSelectedDate(new Date())}
                        className="px-2 py-1 text-[10px] font-black text-green-500 hover:text-green-400 transition-colors"
                      >
                        Today
                      </button>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{entries.length} Items</span>
             </div>
             <div className="divide-y divide-gray-700 flex-1 overflow-y-auto">
                {entries.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-gray-600 text-sm font-bold italic">
                      {selectedDate.toDateString() === new Date().toDateString() 
                        ? 'No meals logged today.' 
                        : `No meals logged on ${selectedDate.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            timeZone: profile?.timezone || 'UTC'
                          })}.`
                      }
                    </p>
                  </div>
                ) : (
                  entries.map((entry) => (
                    <div key={entry.id} className={`p-4 flex justify-between items-center group transition-all ${getHealthColor(entry.name, entry.calories, entry.protein)}`}>
                      <div className="flex gap-3 items-center min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-gray-800/50 flex items-center justify-center text-lg shrink-0">
                            {getFoodEmoji(entry.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-gray-100 text-sm truncate">{entry.name}</p>
                          <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-0.5">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                            <span className="font-black text-gray-100 text-sm">{entry.calories}</span>
                            <span className="text-[8px] font-black text-gray-500 uppercase ml-0.5">kcal</span>
                        </div>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          className="p-1.5 text-gray-400 sm:opacity-0 sm:group-hover:opacity-60 transition-all rounded-md hover:bg-red-900/40"
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

      {/* Spouse Modal */}
      {showSpouseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-3xl shadow-xl border border-gray-700 w-full max-w-md">
            <h3 className="text-xl font-black text-gray-100 mb-4">
              {profile.spouseId ? 'Remove Spouse' : 'Add Spouse'}
            </h3>
            {!profile.spouseId ? (
              <React.Fragment>
                <p className="text-gray-400 mb-4">
                  Enter your spouse's email address to share favorites with each other.
                </p>
                <input
                  type="email"
                  value={spouseEmail}
                  onChange={(e) => setSpouseEmail(e.target.value)}
                  placeholder="spouse@example.com"
                  className="w-full p-3 bg-gray-700 text-gray-100 rounded-xl border border-gray-600 focus:border-green-500 outline-none"
                />
                {spouseError && (
                  <p className="text-red-400 text-sm mt-2">{spouseError}</p>
                )}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleAddSpouse}
                    className="flex-1 py-3 bg-green-600 text-white rounded-xl font-black uppercase tracking-widest text-sm hover:bg-green-700"
                  >
                    Add Spouse
                  </button>
                  <button
                    onClick={() => {
                      setShowSpouseModal(false);
                      setSpouseEmail('');
                      setSpouseError('');
                    }}
                    className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl font-bold hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <p className="text-gray-400 mb-6">
                  Are you sure you want to remove your spouse? This will stop sharing favorites.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleRemoveSpouse}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black uppercase tracking-widest text-sm hover:bg-red-700"
                  >
                    Remove Spouse
                  </button>
                  <button
                    onClick={() => setShowSpouseModal(false)}
                    className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl font-bold hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </React.Fragment>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
