
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, FoodEntry, FoodLog, NutritionEstimate, FoodItemEstimate, FavoritedBreakdown, ItemInsight, WeighIn } from '../types';
import { estimateNutrition, getItemInsight, getProteinSuggestions, getProteinSuggestionDetail, ProteinSuggestionDetail } from '../services/geminiService';
import { getFoodLogs, addFoodLog, deleteFoodLog, supabase, getFavoritedBreakdowns, addFavoritedBreakdown, deleteFavoritedBreakdown, updateFavoritedBreakdown, getSharedFavoritedBreakdowns, addSpouse, removeSpouse, getWeeklyFoodLogs, getWeighIns } from '../services/supabaseService';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { getWeekDates } from '../utils/dateUtils';
import { sttService } from '../services/sttService';
import NutritionLabelScanner from './NutritionLabelScanner';

interface DashboardProps {
  profile: UserProfile | null;
  onLogout: () => void;
  showSpouseModal?: boolean;
  setShowSpouseModal?: (show: boolean) => void;
  selectedDate?: Date;
  setSelectedDate?: (date: Date) => void;
  isImpersonating?: boolean;
  onStopImpersonating?: () => void;
  realProfile?: UserProfile | null;
  impersonatedUserId?: string;
  itemToAdd?: FoodItemEstimate | null;
  onItemAdded?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  profile, 
  onLogout, 
  showSpouseModal: externalShowSpouseModal = false, 
  setShowSpouseModal: externalSetShowSpouseModal = (_: boolean) => {},
  selectedDate: externalSelectedDate = new Date(),
  setSelectedDate: externalSetSelectedDate = (_: Date) => {},
  isImpersonating = false,
  onStopImpersonating = () => {},
  realProfile = null,
  impersonatedUserId,
  itemToAdd,
  onItemAdded
}) => {
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
  const [weeklyData, setWeeklyData] = useState<{ date: string; totalCalories: number }[]>([]);
  const [isListening, setIsListening] = useState(false);
  const currentInputRef = useRef('');
  const [selectedItem, setSelectedItem] = useState<FoodItemEstimate | null>(null);
  const [itemInsight, setItemInsight] = useState<ItemInsight | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const [showLabelScanner, setShowLabelScanner] = useState(false);
  const [breakdownItems, setBreakdownItems] = useState<FoodItemEstimate[]>([]);
  const [showPreviousDayWarning, setShowPreviousDayWarning] = useState(false);
  const [proteinSuggestions, setProteinSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);
  const [suggestionDetail, setSuggestionDetail] = useState<ProteinSuggestionDetail | null>(null);
  const [isLoadingSuggestionDetail, setIsLoadingSuggestionDetail] = useState(false);
  const hasFetchedSuggestions = useRef(false);
  const [latestWeighIn, setLatestWeighIn] = useState<WeighIn | null>(null);

  // Use impersonated user ID if impersonating, otherwise use real user ID
  const effectiveUserId = impersonatedUserId || user?.id;

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (effectiveUserId) {
      loadEntries();
      loadFavoritedBreakdowns();
      loadWeeklyData();
      loadLatestWeighIn();
    }
  }, [effectiveUserId, externalSelectedDate]);

  useEffect(() => {
    if (effectiveUserId && profile) {
      loadEntries();
      loadWeeklyData();
    }
  }, [profile?.timezone, profile?.weighDay, externalSelectedDate]);

  useEffect(() => {
    if (effectiveUserId && profile) {
      loadEntries();
      loadWeeklyData();
    }
  }, [externalSelectedDate]);

  // Handle items added from external sources (e.g., Spouse Today menu)
  useEffect(() => {
    if (itemToAdd) {
      setBreakdownItems(prev => [...prev, itemToAdd]);
      setLastEstimate(prev => ({
        items: prev ? [...prev.items, itemToAdd] : [itemToAdd],
        totalCalories: (prev?.totalCalories || 0) + itemToAdd.calories,
        confidence: prev?.confidence || 'high',
      }));
      onItemAdded?.();
    }
  }, [itemToAdd]);

  const handleToggleListening = () => {
    if (isListening) {
      console.log('Stopping speech recognition');
      sttService.stop();
      setIsListening(false);
    } else {
      console.log('Starting speech recognition');
      // Clear the input when starting voice recording
      setFoodInput('');
      currentInputRef.current = '';
      console.log('Cleared input, ref is now:', currentInputRef.current);
      
      sttService.start(
        (text) => {
          console.log('Speech result:', text);
          const newInput = text;
          currentInputRef.current = newInput;
          console.log('Updated ref to:', currentInputRef.current);
          setFoodInput(newInput);
        },
        () => {
          console.log('Speech recognition ended');
          console.log('Final ref value:', currentInputRef.current);
          console.log('Final state value:', foodInput);
          setIsListening(false);
          // Auto-trigger estimation when recording completes
          const finalText = currentInputRef.current;
          if (finalText.trim()) {
            handleEstimate(finalText);
          }
        },
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
    if (!effectiveUserId) return;
    const weekDates = getWeekDates(externalSelectedDate, profile?.timezone, profile?.weighDay ?? 1);
    const data = await getWeeklyFoodLogs(effectiveUserId, weekDates, profile?.timezone);
    setWeeklyData(data.map(d => ({ date: d.date, totalCalories: d.totalCalories })));
  };

  const loadEntries = async () => {
    if (!effectiveUserId) return;
    const logs = await getFoodLogs(effectiveUserId, externalSelectedDate, profile?.timezone);
    const entries: FoodEntry[] = logs.map(log => ({
      id: log.id,
      timestamp: log.createdAt.getTime(),
      name: log.name,
      calories: log.calories,
      protein: log.protein,
      carbs: log.carbs,
      fat: log.fat,
    }));
    setEntries(entries);
  };

  const loadFavoritedBreakdowns = async () => {
    if (!effectiveUserId) return;
    // Use shared favorites if user has a spouse, otherwise use personal favorites
    const favorites = profile?.spouseId 
      ? await getSharedFavoritedBreakdowns(effectiveUserId)
      : await getFavoritedBreakdowns(effectiveUserId);
    // Sort alphabetically by name
    favorites.sort((a, b) => a.name.localeCompare(b.name));
    setFavoritedBreakdowns(favorites);
  };

  const loadLatestWeighIn = async () => {
    if (!effectiveUserId) return;
    const weighIns = await getWeighIns(effectiveUserId);
    if (weighIns.length > 0) {
      // Get the most recent weigh-in (array is sorted ascending by date)
      setLatestWeighIn(weighIns[weighIns.length - 1]);
    }
  };

  // Use latest weigh-in weight if available, otherwise fall back to profile weight
  const currentWeight = latestWeighIn?.weightLbs || profile?.weightLbs || 150;
  
  // Calculate daily calorie target based on current weight (using Mifflin-St Jeor equation)
  const calculateCurrentCalorieTarget = (): number => {
    if (!profile) return 2000;
    
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
    
    // Apply weight goal
    return Math.round(tdee + parseFloat(profile.weightGoal || '0'));
  };
  
  const dailyCalorieTarget = calculateCurrentCalorieTarget();
  
  const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);
  const totalProtein = entries.reduce((sum, entry) => sum + (entry.protein || 0), 0);
  const totalFat = entries.reduce((sum, entry) => sum + (entry.fat || 0), 0);
  const caloriesRemaining = dailyCalorieTarget - totalCalories;
  const progressPercent = Math.min(100, (totalCalories / dailyCalorieTarget) * 100);
  const targetProtein = Math.round(currentWeight / 2.205 * 1.2);
  const targetFat = Math.round(currentWeight * 0.275);

  // Fetch protein suggestions only once per page load when protein is below target AND viewing today
  useEffect(() => {
    // Don't fetch until we have a user ID
    if (!effectiveUserId) {
      return;
    }
    
    const isToday = externalSelectedDate.toDateString() === new Date().toDateString();
    const needsMoreProtein = totalProtein < targetProtein;
    
    // Reset flag when switching away from today or meeting goal
    if (!isToday || !needsMoreProtein) {
      setProteinSuggestions([]);
      hasFetchedSuggestions.current = false;
      return;
    }
    
    // Only fetch once per session
    if (hasFetchedSuggestions.current) {
      return;
    }
    
    // Debounce to wait for entries to stabilize after loading
    const timeoutId = setTimeout(() => {
      console.log('Fetching protein suggestions...', { totalProtein, targetProtein, entriesCount: entries.length });
      
      const fetchSuggestions = async () => {
        try {
          const suggestions = await getProteinSuggestions(totalProtein, targetProtein, profile?.timezone);
          setProteinSuggestions(suggestions);
          // Only set the flag after successful fetch
          hasFetchedSuggestions.current = true;
        } catch (error) {
          console.error('Failed to fetch protein suggestions:', error);
        }
      };
      
      fetchSuggestions();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [effectiveUserId, entries, externalSelectedDate, profile?.timezone]);

  const handleEstimate = async (textOverride?: string) => {
    // Use textOverride if provided (for voice recordings), otherwise use state
    const textToEstimate = textOverride ?? foodInput;
    
    if (!textToEstimate.trim()) {
      return;
    }
    setIsEstimating(true);
    try {
      const estimate = await estimateNutrition(textToEstimate);
      console.log('Nutrition estimate received:', estimate);
      // Add new items to existing breakdown
      setBreakdownItems(prev => [...prev, ...estimate.items]);
      // Update last estimate with combined items
      const combinedItems = [...breakdownItems, ...estimate.items];
      setLastEstimate({
        items: combinedItems,
        totalCalories: combinedItems.reduce((sum, item) => sum + item.calories, 0),
        confidence: estimate.confidence,
        source: estimate.source,
        sourceUrl: estimate.sourceUrl,
        servingSize: estimate.servingSize,
      });
      // Clear the input after adding
      setFoodInput('');
    } catch (error) {
      alert("Failed to estimate calories. Please try again.");
    } finally {
      setIsEstimating(false);
    }
  };

  const handleLabelScan = async (nutritionText: string) => {
    setShowLabelScanner(false);
    await handleEstimate(nutritionText);
  };

  const handleLabelScanEstimate = (estimate: NutritionEstimate) => {
    setShowLabelScanner(false);
    // Add items directly from the estimate (already has source: 'web')
    setBreakdownItems(prev => [...prev, ...estimate.items]);
    setLastEstimate({
      items: [...breakdownItems, ...estimate.items],
      totalCalories: [...breakdownItems, ...estimate.items].reduce((sum, item) => sum + item.calories, 0),
      confidence: estimate.confidence,
      source: estimate.source,
      sourceUrl: estimate.sourceUrl,
      servingSize: estimate.servingSize,
    });
  };

  const addEntry = async () => {
    if (!effectiveUserId || !lastEstimate || breakdownItems.length === 0) return;

    // Check if selected date is before today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDay = new Date(externalSelectedDate);
    selectedDay.setHours(0, 0, 0, 0);
    
    if (selectedDay < today) {
      setShowPreviousDayWarning(true);
      return;
    }

    // Helper to get date string in user's timezone
    const getDateString = () => {
      if (profile?.timezone) {
        const formatter = new Intl.DateTimeFormat('en-CA', { 
          timeZone: profile.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        return formatter.format(externalSelectedDate);
      }
      // Fallback: use local date parts
      const year = externalSelectedDate.getFullYear();
      const month = String(externalSelectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(externalSelectedDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Create an entry for each breakdown item (round calories to integer for DB)
    const entries = breakdownItems.map(item => ({
      user_id: effectiveUserId,
      name: item.name,
      calories: Math.round(item.calories),
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      description: item.name,
      date: getDateString(),
    }));

    // Insert all entries at once
    const { data, error } = await supabase
      .from('food_logs')
      .insert(entries);
    
    await loadEntries();
    await loadWeeklyData();
    setFoodInput('');
    setLastEstimate(null);
    setBreakdownItems([]);
  };

  const confirmAddEntry = async () => {
    if (!effectiveUserId || !lastEstimate || breakdownItems.length === 0) return;

    // Helper to get date string in user's timezone
    const getDateString = () => {
      if (profile?.timezone) {
        const formatter = new Intl.DateTimeFormat('en-CA', { 
          timeZone: profile.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        return formatter.format(externalSelectedDate);
      }
      // Fallback: use local date parts
      const year = externalSelectedDate.getFullYear();
      const month = String(externalSelectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(externalSelectedDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Create an entry for each breakdown item (round calories to integer for DB)
    const entries = breakdownItems.map(item => ({
      user_id: effectiveUserId,
      name: item.name,
      calories: Math.round(item.calories),
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      description: item.name,
      date: getDateString(),
    }));

    // Insert all entries at once
    const { error } = await supabase
      .from('food_logs')
      .insert(entries);
    
    await loadEntries();
    await loadWeeklyData();
    setFoodInput('');
    setLastEstimate(null);
    setBreakdownItems([]);
    setShowPreviousDayWarning(false);
  };

  const deleteEntry = async (id: string) => {
    await deleteFoodLog(id);
    await loadEntries();
    await loadWeeklyData();
  };

  const handleItemClick = async (item: FoodItemEstimate) => {
    setSelectedItem(item);
    setItemInsight(null);
    setIsLoadingInsight(true);
    try {
      const insight = await getItemInsight(item);
      setItemInsight(insight);
    } catch (error) {
      console.error('Failed to get item insight:', error);
    } finally {
      setIsLoadingInsight(false);
    }
  };

  const closeInsightModal = () => {
    setSelectedItem(null);
    setItemInsight(null);
  };

  const handleSuggestionClick = async (suggestion: string) => {
    setSelectedSuggestion(suggestion);
    setSuggestionDetail(null);
    setIsLoadingSuggestionDetail(true);
    try {
      const detail = await getProteinSuggestionDetail(suggestion);
      setSuggestionDetail(detail);
    } catch (error) {
      console.error('Failed to get suggestion detail:', error);
    } finally {
      setIsLoadingSuggestionDetail(false);
    }
  };

  const closeSuggestionModal = () => {
    setSelectedSuggestion(null);
    setSuggestionDetail(null);
  };

  const removeBreakdownItem = (index: number) => {
    const newItems = breakdownItems.filter((_, i) => i !== index);
    setBreakdownItems(newItems);
    
    // Update last estimate
    if (newItems.length > 0) {
      setLastEstimate({
        items: newItems,
        totalCalories: newItems.reduce((sum, item) => sum + item.calories, 0),
        confidence: 1,
      });
    } else {
      setLastEstimate(null);
    }
  };

  const favoriteBreakdown = async () => {
    if (!lastEstimate || !effectiveUserId) return;
    
    const favorite: Omit<FavoritedBreakdown, 'id' | 'createdAt'> = {
      name: breakdownItems.map(item => item.name).join(', '),
      breakdown: lastEstimate.items,
      totalCalories: lastEstimate.totalCalories,
    };
    
    await addFavoritedBreakdown(effectiveUserId, favorite);
    await loadFavoritedBreakdowns();
  };

  const useFavoritedBreakdown = (favorite: FavoritedBreakdown) => {
    setLastEstimate({
      items: favorite.breakdown,
      totalCalories: favorite.totalCalories,
      confidence: 1,
    });
    setBreakdownItems(favorite.breakdown);
    setFoodInput('');
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
    
    const { error } = await addSpouse(effectiveUserId, spouseEmail);
    if (error) {
      setSpouseError(error.message || 'Failed to add spouse');
    } else {
      externalSetShowSpouseModal(false);
      setSpouseEmail('');
      // Reload profile to get spouse info
      window.location.reload();
    }
  };

  const handleRemoveSpouse = async () => {
    await removeSpouse(effectiveUserId);
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

  
  const data = [
    { name: 'Consumed', value: totalCalories },
    { name: 'Remaining', value: Math.max(0, caloriesRemaining) },
  ];
  const COLORS = ['#10b981', '#374151'];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Impersonation Banner */}
      {isImpersonating && (
        <div className="bg-purple-900/30 border border-purple-700/50 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
            </svg>
            <div>
              <p className="text-purple-300 font-medium">Viewing as: {profile?.age}y {profile?.gender === 'male' ? 'Male' : 'Female'}, {profile?.weightLbs}lbs</p>
              <p className="text-purple-400 text-sm">You are impersonating this user</p>
            </div>
          </div>
          <button
            onClick={onStopImpersonating}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
            Stop Impersonating
          </button>
        </div>
      )}
      
      {!profile ? (
        <div className="bg-gray-800 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-black text-gray-100 mb-4">Complete Your Profile</h2>
          <p className="text-gray-400 mb-6">
            Please complete your profile to start tracking your nutrition and calories.
          </p>
          <p className="text-sm text-gray-500">
            The profile setup modal should appear automatically. If it doesn't, please refresh the page.
          </p>
        </div>
      ) : (
        <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
        {/* Left Column: Input & AI */}
        <div className="lg:col-span-2 flex flex-col">
          <div className="bg-gray-800 p-3 rounded-3xl shadow-sm border border-gray-700">
            <h2 className="text-xl font-black text-gray-100 mb-4 flex items-center gap-2">
                <div className="w-2 h-6 bg-green-500 rounded-full"></div>
                Log Your Food
            </h2>
            <div className="relative">
              <textarea
                value={foodInput}
                onChange={(e) => setFoodInput(e.target.value)}
                placeholder="Type or Speak (e.g. '2 slices of toast','Burger King small fry'), or Scan brand label and optionally nutrition facts"
                className="w-full p-4 pr-12 h-48 border border-gray-600 rounded-2xl focus:ring-4 focus:ring-green-500/10 outline-none resize-none transition-all bg-gray-700 text-gray-100 placeholder-gray-500 font-medium"
              />
              {foodInput && (
                <button
                  onClick={() => setFoodInput('')}
                  className="absolute top-6 right-6 p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-600 transition-all"
                  title="Clear input"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              )}
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
                  onClick={() => setShowLabelScanner(true)}
                  className="p-3 rounded-xl bg-gray-600 text-gray-300 hover:bg-gray-500 transition-all shadow-xl shadow-black/50 active:scale-95"
                  title="Scan nutrition label"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  </svg>
                </button>
                <button
                  onClick={() => handleEstimate()}
                  disabled={isEstimating || !foodInput}
                  className="px-8 py-3 bg-gray-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-gray-500 transition-all disabled:opacity-50 shadow-xl shadow-black/50 active:scale-95"
                >
                  {isEstimating ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Analyzing...
                    </span>
                  ) : 'Submit'}
                </button>
              </div>
            </div>

            {/* Favorited Breakdowns */}
            {favoritedBreakdowns.length > 0 && (
              <div className="mt-6">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Favorites</p>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mb-2">
                  {favoritedBreakdowns.slice(0, favoritedBreakdowns.length).map((favorite) => (
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
                            className={`flex-shrink-0 min-w-fit px-3 py-1 bg-gray-700 text-gray-300 rounded-xl text-sm font-medium transition-all border border-gray-600 active:scale-95 active:bg-gray-500 ${favorite.userId === user?.id ? 'pr-16' : ''}`}
                          >
                            <span className="text-gray-300 whitespace-nowrap">{favorite.name}</span>
                          </button>
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                            {favorite.userId === user?.id && (
                              <>
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
                              </>
                            )}
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
                    <div className="flex gap-3 mt-2">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Protein</span>
                        <span className="text-xs font-black text-blue-400">{breakdownItems.reduce((sum, i) => sum + i.protein, 0)}g</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest">Fat</span>
                        <span className="text-xs font-black text-yellow-400">{breakdownItems.reduce((sum, i) => sum + i.fat, 0)}g</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-purple-500 uppercase tracking-widest">Carbs</span>
                        <span className="text-xs font-black text-purple-400">{breakdownItems.reduce((sum, i) => sum + i.carbs, 0)}g</span>
                      </div>
                    </div>
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
                                            {lastEstimate.servingSize && (
                        <div className="text-[8px] text-gray-500 mt-1">{lastEstimate.servingSize}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-8">
                  {breakdownItems.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="bg-gray-800/60 p-4 rounded-2xl flex justify-between items-center border border-green-800/50 hover:bg-gray-700/60 hover:border-green-700 transition-all"
                    >
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => handleItemClick(item)}
                      >
                        <p className="font-bold text-gray-100">
                          {item.name}
                          {item.source === 'web' && (
                            <span className="inline-block ml-1.5 text-purple-400" title="Brand verified">
                              <svg className="w-3.5 h-3.5 inline" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                        </p>
                        <div className="flex gap-3 mt-1">
                          <span className="text-[10px] text-gray-500 font-black">P: {item.protein}g</span>
                          <span className="text-[10px] text-gray-500 font-black">C: {item.carbs}g</span>
                          <span className="text-[10px] text-gray-500 font-black">F: {item.fat}g</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="font-black text-gray-100">{item.calories}</span>
                          <span className="text-[10px] font-black text-gray-500 uppercase ml-1">kcal</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeBreakdownItem(idx);
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded-md hover:bg-red-900/20"
                          title="Remove item"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={addEntry}
                        className="flex-1 py-4 bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-green-700 shadow-xl shadow-black/50 transition-all active:scale-95"
                    >
                        Confirm {breakdownItems.length > 1 ? 'all items' : 'entry'}
                    </button>
                    <button
                        onClick={() => {
                            setLastEstimate(null);
                            setBreakdownItems([]);
                        }}
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
            <h2 className="text-base font-black text-gray-100 mb-3">Today</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Calories</p>
                  <p className="text-2xl font-black text-gray-100">{totalCalories}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-wider">Target</p>
                  <p className="text-2xl font-black text-gray-100">{dailyCalorieTarget}</p>
                </div>
              </div>
              
              <div className="relative">
                <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ease-out rounded-full ${caloriesRemaining < 0 ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(100, progressPercent)}%` }}
                  ></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-xs font-black ${progressPercent > 50 ? 'text-white' : 'text-gray-300'}`}>
                    {Math.round(progressPercent)}%
                  </span>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-black text-gray-400">
                    Protein: <span className="text-gray-100">{Math.round(totalProtein)}/{targetProtein}g</span> • Fat: <span className="text-gray-100">{Math.round(totalFat)}/{targetFat}g</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-gray-100">
                    <span className={`${caloriesRemaining < 0 ? 'text-red-400' : 'text-green-500'}`}>
                      {caloriesRemaining < 0 ? 'Over by' : 'Remaining'}
                    </span> {Math.round(Math.abs(caloriesRemaining))} kcal
                  </p>
                </div>
              </div>

              {/* Protein Suggestions */}
              {proteinSuggestions.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => handleSuggestionClick(proteinSuggestions[0])}
                    className="w-full text-left px-3 py-2 bg-blue-900/20 border border-blue-800/50 rounded-lg text-xs text-blue-300 hover:bg-blue-900/30 hover:border-blue-700 transition-all"
                  >
                    💡 {proteinSuggestions[0]}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Weekly Calorie Tracker */}
          <div className="mt-6 lg:mt-8 bg-gray-800 p-4 rounded-3xl shadow-sm border border-gray-700">
            <h2 className="text-base font-black text-gray-100 mb-3">Weekly Progress</h2>
            <div className="space-y-2">
              {(() => {
                // Generate day labels starting from weighDay
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const weighDay = profile?.weighDay ?? 1;
                const rotatedDays = [...dayNames.slice(weighDay), ...dayNames.slice(0, weighDay)];
                return rotatedDays;
              })().map((day, index) => {
                const dayData = weeklyData[index];
                const weighDay = profile?.weighDay ?? 1;
                // Calculate which actual day of week this index represents
                const actualDayOfWeek = (weighDay + index) % 7;
                const isToday = externalSelectedDate.toDateString() === new Date().toDateString() && 
                               new Date().getDay() === actualDayOfWeek;
                const calories = dayData?.totalCalories || 0;
                const percent = Math.min(100, (calories / dailyCalorieTarget) * 100);
                
                return (
                  <div key={day} className="flex items-center gap-3">
                    <span className={`text-xs font-black w-8 ${isToday ? 'text-green-500' : 'text-gray-500'}`}>
                      {day}
                    </span>
                    <div className="flex-1 relative">
                      <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ease-out rounded-full ${
                            calories > dailyCalorieTarget 
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
                const weighDay = profile?.weighDay ?? 1;
                // Calculate today's index in the rotated week (0 = first day of week, 6 = last day)
                let todayIndex = currentDayOfWeek - weighDay;
                if (todayIndex < 0) todayIndex += 7;
                const dailyTarget = dailyCalorieTarget;
                
                // Get today's calories and check if over target
                const todayCalories = weeklyData[todayIndex]?.totalCalories || 0;
                const isTodayOver = todayCalories > dailyTarget;
                
                // Completed days (before today)
                const weeklyTotalBeforeToday = weeklyData.slice(0, todayIndex).reduce((sum, day) => sum + day.totalCalories, 0);
                const weeklyTargetBeforeToday = dailyTarget * todayIndex;
                
                // For deficit calculation: use completed days, and include today ONLY if over target
                // If today is over, include today's full calories and target (not just overage)
                const effectiveTotal = weeklyTotalBeforeToday + (isTodayOver ? todayCalories : 0);
                const effectiveTarget = weeklyTargetBeforeToday + (isTodayOver ? dailyTarget : 0);
                
                const weeklyTotalSoFar = weeklyData.reduce((sum, day) => sum + day.totalCalories, 0);
                
                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-gray-500 uppercase tracking-wider">Weekly Total</span>
                      <span className="text-sm font-black text-gray-100">
                        {weeklyTotalSoFar} / {dailyCalorieTarget * (todayIndex + 1)} kcal
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-gray-500 uppercase tracking-wider">Net Calories</span>
                      <span className={`text-sm font-black ${
                        effectiveTotal > effectiveTarget ? 'text-red-400' : 'text-green-500'
                      }`}>
                        {(() => {
                          const variance = effectiveTotal - effectiveTarget;
                          return variance > 0 
                            ? `+${variance} kcal`
                            : `${variance} kcal`;
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs font-black text-gray-500 uppercase tracking-wider">Daily Avg</span>
                      <span className="text-sm font-black text-gray-100">
                        {todayIndex > 0 ? Math.round(weeklyTotalBeforeToday / todayIndex) : 0} kcal
                      </span>
                    </div>
                    {(() => {
                      // Calculate projected weight change based on weekly deficit/surplus
                      // 3500 calories = 1 lb of weight
                      
                      // First, calculate the baseline weight change from the profile's weight goal
                      // Weight goal is negative for loss (e.g., -1000 for 2 lbs/week loss)
                      const weightGoalValue = parseFloat(profile?.weightGoal || '0');
                      const baselineWeeklyDeficit = -weightGoalValue * 7; // Negate: -(-1000) * 7 = +7000 cal deficit/week
                      
                      // Then, calculate additional deficit/surplus from eating above/below target
                      // Use effectiveTotal/effectiveTarget which only counts today if over target
                      const daysToProject = effectiveTarget > 0 ? (effectiveTarget / dailyTarget) : Math.max(1, todayIndex);
                      const additionalDeficit = effectiveTarget - effectiveTotal;
                      const projectedAdditionalDeficit = daysToProject > 0 ? (additionalDeficit / daysToProject) * 7 : 0;
                      
                      // Total projected deficit includes both baseline goal and actual performance
                      const totalProjectedDeficit = baselineWeeklyDeficit + projectedAdditionalDeficit;
                      const projectedWeightChange = totalProjectedDeficit / 3500;
                      
                      if (Math.abs(projectedWeightChange) < 0.05) return null; // Don't show if negligible
                      
                      return (
                        <div className="mt-2 p-2 bg-gray-700/30 rounded-lg">
                          <p className="text-xs text-gray-100">
                            At your current pace, you should{' '}
                            <span className={`font-bold ${projectedWeightChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {projectedWeightChange > 0 ? 'lose' : 'gain'} {Math.abs(projectedWeightChange).toFixed(1)} lbs
                            </span>
                            {' '}this week{projectedWeightChange > 0 ? '! Keep it up' : ''}{profile?.displayName ? `, ${profile.displayName}` : ''}{projectedWeightChange > 0 ? '! 🎉 🎊 🥳' : '. You are going the wrong way! LOCK IN 💪'}
                          </p>
                        </div>
                      );
                    })()}
                    <p className="text-[11px] text-gray-400 mt-2 italic text-center">- Any Surplus today is not added to Net Calories until tomorrow -<br></br>- Daily average does not count today until tomorrow -</p>
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
                <h2 className="text-lg font-black text-gray-100">Daily Log</h2>
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{entries.length} Items</span>
             </div>
             <div className="divide-y divide-gray-700 flex-1 overflow-y-auto">
                {entries.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-gray-600 text-sm font-bold italic">
                      {externalSelectedDate.toDateString() === new Date().toDateString() 
                        ? 'No meals logged today.' 
                        : `No meals logged on ${externalSelectedDate.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            timeZone: profile?.timezone || 'UTC'
                          })}.`
                      }
                    </p>
                  </div>
                ) : (
                  entries.map((entry) => (
                    <div key={entry.id} className="p-4 flex justify-between items-center group transition-all hover:bg-gray-700/50 cursor-pointer" onClick={() => handleItemClick(entry)}>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteEntry(entry.id);
                          }}
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
      {externalShowSpouseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-3xl shadow-xl border border-gray-700 w-full max-w-md">
            <h3 className="text-xl font-black text-gray-100 mb-4">
              {profile?.spouseId ? 'Remove Spouse' : 'Add Spouse'}
            </h3>
            {!profile?.spouseId ? (
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
                      externalSetShowSpouseModal(false);
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
                    onClick={() => externalSetShowSpouseModal(false)}
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

      {/* Item Insight Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={closeInsightModal}>
          <div 
            className="bg-gray-800 rounded-3xl p-6 max-w-md w-full border border-gray-700 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-black text-gray-100">{selectedItem.name}</h3>
                <div className="flex gap-4 mt-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Calories</span>
                    <span className="text-sm font-black text-gray-100">{selectedItem.calories} kcal</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Protein</span>
                    <span className="text-sm font-black text-blue-400">{selectedItem.protein}g</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">Fat</span>
                    <span className="text-sm font-black text-yellow-400">{selectedItem.fat}g</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-purple-500 uppercase tracking-widest">Carbs</span>
                    <span className="text-sm font-black text-purple-400">{selectedItem.carbs}g</span>
                  </div>
                </div>
              </div>
              <button
                onClick={closeInsightModal}
                className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {isLoadingInsight ? (
              <div className="flex flex-col items-center justify-center py-8">
                <svg className="animate-spin h-8 w-8 text-green-500 mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-gray-400 text-sm">Getting AI insights...</p>
              </div>
            ) : itemInsight ? (
              <div className="space-y-4">
                <div className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                  itemInsight.verdict === 'healthy' ? 'bg-green-900/50 text-green-400' :
                  itemInsight.verdict === 'moderate' ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-red-900/50 text-red-400'
                }`}>
                  {itemInsight.verdict}
                </div>

                <p className="text-gray-300 text-sm leading-relaxed">{itemInsight.summary}</p>

                <div className="space-y-2">
                  {itemInsight.highlights.map((highlight, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className={`mt-0.5 ${highlight.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {highlight.isPositive ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        )}
                      </span>
                      <span className="text-gray-400 text-sm">{highlight.text}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-gray-700/50 rounded-xl p-3 mt-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">💡 Tip</p>
                  <p className="text-gray-300 text-sm">{itemInsight.tip}</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-center py-4">Failed to load insights. Tap to try again.</p>
            )}
          </div>
        </div>
      )}

      {/* Protein Suggestion Detail Modal */}
      {selectedSuggestion && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={closeSuggestionModal}>
          <div 
            className="bg-gray-800 rounded-3xl p-6 max-w-md w-full border border-gray-700 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-black text-blue-400">💡 Protein Boost</h3>
                <p className="text-sm text-gray-400 mt-1">{selectedSuggestion}</p>
              </div>
              <button
                onClick={closeSuggestionModal}
                className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {isLoadingSuggestionDetail ? (
              <div className="flex flex-col items-center justify-center py-8">
                <svg className="animate-spin h-8 w-8 text-blue-500 mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-gray-400 text-sm">Getting details...</p>
              </div>
            ) : suggestionDetail ? (
              <div className="space-y-4">
                <p className="text-gray-300 text-sm leading-relaxed">{suggestionDetail.summary}</p>

                <div className="space-y-2">
                  {suggestionDetail.highlights.map((highlight, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className={`mt-0.5 ${highlight.isPositive ? 'text-blue-400' : 'text-yellow-400'}`}>
                        {highlight.isPositive ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        )}
                      </span>
                      <span className="text-gray-400 text-sm">{highlight.text}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-blue-900/20 rounded-xl p-3 mt-4 border border-blue-800/50">
                  <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">💡 Quick Tip</p>
                  <p className="text-gray-300 text-sm">{suggestionDetail.tip}</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-center py-4">Failed to load details. Tap to try again.</p>
            )}
          </div>
        </div>
      )}

      {/* Nutrition Label Scanner Modal */}
      <NutritionLabelScanner
        isOpen={showLabelScanner}
        onClose={() => setShowLabelScanner(false)}
        onScan={handleLabelScan}
        onScanEstimate={handleLabelScanEstimate}
      />

      {/* Previous Day Warning Modal */}
      {showPreviousDayWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-3xl shadow-xl border border-gray-700 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-yellow-900/30 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-gray-100">Logging for a Previous Day</h3>
            </div>
            <p className="text-gray-400 mb-6">
              You're about to add food entries for {externalSelectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}. 
              Are you sure you want to continue?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPreviousDayWarning(false)}
                className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl font-bold hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddEntry}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-black uppercase tracking-widest text-sm hover:bg-green-700"
              >
                Confirm Anyway
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
