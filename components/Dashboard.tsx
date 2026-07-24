
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, FoodEntry, FoodLog, NutritionEstimate, FoodItemEstimate, FavoritedBreakdown, ItemInsight, WeighIn } from '../types';
import { estimateNutrition, getItemInsight, getProteinSuggestions, getProteinSuggestionDetail, ProteinSuggestionDetail } from '../services/geminiService';
import { getFoodLogs, addFoodLog, deleteFoodLog, updateFoodLog, supabase, getFavoritedBreakdowns, addFavoritedBreakdown, deleteFavoritedBreakdown, updateFavoritedBreakdown, getSharedFavoritedBreakdowns, addSpouse, removeSpouse, getWeeklyFoodLogs, getWeighIns } from '../services/supabaseService';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { getWeekDates, getLocalDateKey } from '../utils/dateUtils';
import { FoodCategory, CATEGORIES, groupFavoritesByCategory } from '../utils/foodCategories';
import { sttService } from '../services/sttService';
import NutritionLabelScanner from './NutritionLabelScanner';
import LiveFoodModal from './LiveFoodModal';

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
  maintenanceDays?: Set<string>;
  liveVoice?: string;
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
  onItemAdded,
  maintenanceDays = new Set<string>(),
  liveVoice
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
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [breakdownItems, setBreakdownItems] = useState<FoodItemEstimate[]>([]);
  const [calorieOverrides, setCalorieOverrides] = useState<(number | null)[]>([]);
  const [portionSizes, setPortionSizes] = useState<Record<number, number>>({});
  const [showPreviousDayWarning, setShowPreviousDayWarning] = useState(false);
  const [proteinSuggestions, setProteinSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);
  const [suggestionDetail, setSuggestionDetail] = useState<ProteinSuggestionDetail | null>(null);
  const [isLoadingSuggestionDetail, setIsLoadingSuggestionDetail] = useState(false);
  const [editingCalorieEntry, setEditingCalorieEntry] = useState<FoodEntry | null>(null);
  const [calorieEditValue, setCalorieEditValue] = useState<number>(0);
  const hasFetchedSuggestions = useRef(false);
  const [latestWeighIn, setLatestWeighIn] = useState<WeighIn | null>(null);
  const [addToSpouseFood, setAddToSpouseFood] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<FoodCategory | null>(null);

  // Spouse-sharing intent as a ref so the (async) save reads a synchronous value,
  // avoiding a stale-state race when the voice assistant toggles it then confirms.
  const spouseSharingRef = useRef(false);
  const updateSpouseSharing = (enabled: boolean) => {
    spouseSharingRef.current = enabled;
    setAddToSpouseFood(enabled);
  };

  // Latest-ref for the voice "confirm" action: the modal captures the callback once,
  // but this always runs against the current staged items.
  const liveConfirmRef = useRef<() => Promise<{ count: number; spouse: boolean }>>(
    async () => ({ count: 0, spouse: false })
  );

  // Latest-ref for the voice "log a favorite by name" action (matches against current favorites).
  const liveLogFavoriteRef = useRef<
    (name: string) => Promise<{ matched: boolean; name?: string; count?: number; calories?: number }>
  >(async () => ({ matched: false }));

  const appendBreakdownItems = (items: FoodItemEstimate[]) => {
    if (!items.length) return;
    setBreakdownItems(prev => [...prev, ...items]);
    setCalorieOverrides(prev => [...prev, ...items.map(() => null)]);
  };

  const resetBreakdownItems = () => {
    setBreakdownItems([]);
    setCalorieOverrides([]);
  };

  const getAdjustedCalories = (item: FoodItemEstimate, index: number) => {
    const portion = portionSizes[index] || 1;
    const override = calorieOverrides[index];
    const baseCalories = item.calories * portion;
    return override !== null && override !== undefined ? override : baseCalories;
  };

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
      appendBreakdownItems([itemToAdd]);
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
      fiber: log.fiber,
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
  
  // Calculate daily calorie targets based on current weight (using Mifflin-St Jeor equation)
  // Returns both the goal-adjusted target and the maintenance (TDEE) target
  const calculateCalorieTargets = (): { goalTarget: number; maintenanceTarget: number } => {
    if (!profile) return { goalTarget: 2000, maintenanceTarget: 2000 };
    
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
  
  const { goalTarget: goalCalorieTarget, maintenanceTarget: maintenanceCalorieTarget } = calculateCalorieTargets();
  
  const isDateMaintenance = (date: Date): boolean => maintenanceDays.has(getLocalDateKey(date));
  const getTargetForDate = (date: Date): number =>
    isDateMaintenance(date) ? maintenanceCalorieTarget : goalCalorieTarget;
  
  const isSelectedMaintenance = isDateMaintenance(externalSelectedDate);
  const dailyCalorieTarget = isSelectedMaintenance ? maintenanceCalorieTarget : goalCalorieTarget;

  // Dates for the currently-viewed week (used to check per-day maintenance flags)
  const weekDateObjs = getWeekDates(externalSelectedDate, profile?.timezone, profile?.weighDay ?? 1);
  
  const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);
  const totalProtein = entries.reduce((sum, entry) => sum + (entry.protein || 0), 0);
const totalFat = entries.reduce((sum, entry) => sum + (entry.fat || 0), 0);
  const totalFiber = entries.reduce((sum, entry) => sum + (entry.fiber || 0), 0);
  const caloriesRemaining = dailyCalorieTarget - totalCalories;
  const progressPercent = Math.min(100, (totalCalories / dailyCalorieTarget) * 100);
  const targetProtein = Math.round(currentWeight / 2.205 * 1.2);
  const targetFat = Math.round(currentWeight * 0.275);
  const targetFiber = Math.round((maintenanceCalorieTarget / 1000) * 14); // 14g per 1000 kcal (FDA guideline)
  const breakdownTotalCalories = breakdownItems.reduce(
    (sum, item, idx) => sum + getAdjustedCalories(item, idx),
    0
  );

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
      appendBreakdownItems(estimate.items);
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
} catch (error: any) {
      const message = error?.message || error?.toString() || 'Unknown error';
      alert(`Failed to estimate calories: ${message}`);
      console.error('Estimate error:', error);
    } finally {
      setIsEstimating(false);
    }
  };

  // Snapshot of the selected day handed to the live assistant so it can react
  // naturally to what's already been eaten and how much room is left.
  const buildLiveContext = (): string => {
    const isToday = externalSelectedDate.toDateString() === new Date().toDateString();
    const lines: string[] = [];
    if (profile?.displayName) lines.push(`Name: ${profile.displayName}`);
    lines.push(`Day: ${isToday ? 'today' : externalSelectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`);
    lines.push(`Calorie target: ${dailyCalorieTarget} kcal${isSelectedMaintenance ? ' (maintenance day)' : ''}`);
    lines.push(`Eaten so far: ${Math.round(totalCalories)} kcal`);
    lines.push(
      caloriesRemaining >= 0
        ? `Calories remaining: ${Math.round(caloriesRemaining)} kcal`
        : `Over target by: ${Math.round(Math.abs(caloriesRemaining))} kcal`
    );
    lines.push(`Protein so far: ${Math.round(totalProtein)}/${targetProtein} g`);
    if (entries.length === 0) {
      lines.push('Foods logged so far: nothing yet.');
    } else {
      lines.push(
        `Foods logged so far (${entries.length}): ${entries.map(e => `${e.name} (${e.calories} kcal)`).join(', ')}`
      );
    }
    if (favoritedBreakdowns.length > 0) {
      const MAX = 40;
      const names = favoritedBreakdowns
        .slice(0, MAX)
        .map(f => `${f.name} (${f.totalCalories} kcal)`)
        .join(', ');
      const extra = favoritedBreakdowns.length > MAX ? `, and ${favoritedBreakdowns.length - MAX} more` : '';
      lines.push(`Saved favorites (use log_favorite by name): ${names}${extra}`);
    }
    return lines.join('\n');
  };

  // Items arriving from the live voice session flow into the same breakdown
  // pipeline as typed/scanned entries, so the user still reviews and confirms.
  const handleLiveFoodLogged = (items: FoodItemEstimate[]) => {
    if (!items.length) return;
    appendBreakdownItems(items);
    setLastEstimate(prev => {
      const combined = prev ? [...prev.items, ...items] : [...items];
      return {
        items: combined,
        totalCalories: combined.reduce((sum, i) => sum + i.calories, 0),
        confidence: prev?.confidence ?? 1,
      };
    });
  };

  const handleLabelScan = async (nutritionText: string) => {
    setShowLabelScanner(false);
    await handleEstimate(nutritionText);
  };

  const handleLabelScanEstimate = (estimate: NutritionEstimate) => {
    setShowLabelScanner(false);
    // Add items directly from the estimate (already has source: 'web')
    appendBreakdownItems(estimate.items);
    setLastEstimate({
      items: [...breakdownItems, ...estimate.items],
      totalCalories: [...breakdownItems, ...estimate.items].reduce((sum, item) => sum + item.calories, 0),
      confidence: estimate.confidence,
      source: estimate.source,
      sourceUrl: estimate.sourceUrl,
      servingSize: estimate.servingSize,
    });
  };

  const getDateString = (date: Date) => {
    if (profile?.timezone) {
      const formatter = new Intl.DateTimeFormat('en-CA', { 
        timeZone: profile.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return formatter.format(date);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const saveEntryForDate = async (date: Date) => {
    if (!effectiveUserId || !lastEstimate || breakdownItems.length === 0) return;

    const ownEntries = breakdownItems.map((item, idx) => {
      const portion = portionSizes[idx] || 1;
      const finalCalories = Math.round(getAdjustedCalories(item, idx));
      return {
        user_id: effectiveUserId,
        name: item.name,
calories: finalCalories,
        protein: Math.round(item.protein * portion),
        carbs: Math.round(item.carbs * portion),
        fat: Math.round(item.fat * portion),
        fiber: Math.round((item.fiber || 0) * portion),
        description: item.name,
        date: getDateString(date),
      };
    });
    const entries = spouseSharingRef.current && profile?.spouseId
      ? [
          ...ownEntries,
          ...ownEntries.map(entry => ({
            ...entry,
            user_id: profile.spouseId,
          })),
        ]
      : ownEntries;

    setFoodInput('');
    setLastEstimate(null);
    resetBreakdownItems();
    setPortionSizes({});
    setShowPreviousDayWarning(false);
    updateSpouseSharing(false);

    const { error } = await supabase
      .from('food_logs')
      .insert(entries)
      .select();
    
    if (error) {
      console.error('saveEntryForDate insert error:', { error, entries, effectiveUserId, addToSpouseFood, spouseId: profile?.spouseId });
    }
    
    await loadEntries();
    await loadWeeklyData();
  };

  // Voice "confirm": save whatever is staged to the selected date, reporting the count
  // and whether it was mirrored to the spouse. Reassigned each render so the callback the
  // live modal captured once always sees the current staged items.
  liveConfirmRef.current = async () => {
    const count = breakdownItems.length;
    if (!count || !lastEstimate) return { count: 0, spouse: false };
    const spouse = spouseSharingRef.current && !!profile?.spouseId;
    await saveEntryForDate(externalSelectedDate);
    return { count, spouse };
  };

  // Voice "log a favorite": match the spoken name against saved favorites and stage its
  // exact stored breakdown. Reassigned each render so it sees the current favorites list.
  liveLogFavoriteRef.current = async (spoken: string) => {
    const norm = spoken.trim().toLowerCase();
    if (!norm) return { matched: false };
    const exact = favoritedBreakdowns.find(f => f.name.trim().toLowerCase() === norm);
    const loose = favoritedBreakdowns.find(f => {
      const fn = f.name.trim().toLowerCase();
      return fn.includes(norm) || norm.includes(fn);
    });
    const fav = exact || loose;
    if (!fav || !fav.breakdown?.length) return { matched: false };
    handleLiveFoodLogged(fav.breakdown);
    return { matched: true, name: fav.name, count: fav.breakdown.length, calories: fav.totalCalories };
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

    await saveEntryForDate(externalSelectedDate);
  };

  const confirmAddEntry = async () => {
    await saveEntryForDate(externalSelectedDate);
  };

  const addEntryToToday = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await saveEntryForDate(today);
    externalSetSelectedDate(today);
  };

  const deleteEntry = async (id: string) => {
    await deleteFoodLog(id);
    await loadEntries();
    await loadWeeklyData();
  };

  const handleCalorieEdit = (entry: FoodEntry) => {
    setEditingCalorieEntry(entry);
    setCalorieEditValue(entry.calories);
  };

  const handleSaveCalorieEdit = async () => {
    if (!editingCalorieEntry) return;
    
    await updateFoodLog(editingCalorieEntry.id, { calories: calorieEditValue });
    setEditingCalorieEntry(null);
    await loadEntries();
    await loadWeeklyData();
  };

  const closeCalorieEdit = () => {
    setEditingCalorieEntry(null);
  };

  const addToBreakdown = (item: FoodItemEstimate) => {
    appendBreakdownItems([item]);
    setLastEstimate(prev => {
      const combinedItems = prev ? [...prev.items, item] : [item];
      return {
        items: combinedItems,
        totalCalories: combinedItems.reduce((sum, i) => sum + i.calories, 0),
        confidence: prev?.confidence || 0.9,
      };
    });
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
    setCalorieOverrides(prev => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
    
    // Rebuild portion sizes with shifted indices
    const newPortions: Record<number, number> = {};
    let newIdx = 0;
    for (let i = 0; i < breakdownItems.length; i++) {
      if (i === index) continue;
      if (portionSizes[i] && portionSizes[i] !== 1) {
        newPortions[newIdx] = portionSizes[i];
      }
      newIdx++;
    }
    setPortionSizes(newPortions);
    
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
    setBreakdownItems(prev => {
      const combined = [...prev, ...favorite.breakdown];
      setLastEstimate({
        items: combined,
        totalCalories: combined.reduce((sum, i) => sum + i.calories, 0),
        confidence: 1,
      });
      return combined;
    });
    setCalorieOverrides(prev => [...prev, ...favorite.breakdown.map(() => null)]);
    setFoodInput('');
    setSelectedCategory(null);
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
    <div className="max-w-6xl mx-auto space-y-5 lg:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Impersonation Banner */}
      {isImpersonating && (
        <div className="bg-violet-500/10 border border-violet-500/30 rounded-3xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-violet-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
            </svg>
            <div>
              <p className="text-violet-300 font-semibold text-sm">Viewing as: {profile?.age}y {profile?.gender === 'male' ? 'Male' : 'Female'}, {profile?.weightLbs}lbs</p>
              <p className="text-violet-400/80 text-xs">You are impersonating this user</p>
            </div>
          </div>
          <button
            onClick={onStopImpersonating}
            className="h-11 px-4 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
            Stop Impersonating
          </button>
        </div>
      )}

      {!profile ? (
        <div className="bg-card border border-line rounded-3xl shadow-card p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-snow mb-3">Complete Your Profile</h2>
          <p className="text-fog mb-4">
            Please complete your profile to start tracking your nutrition and calories.
          </p>
          <p className="text-sm text-mist">
            The profile setup modal should appear automatically. If it doesn't, please refresh the page.
          </p>
        </div>
      ) : (
        <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8 items-stretch">
        {/* Left Column: Input & AI */}
        <div className="lg:col-span-2 flex flex-col gap-5 lg:gap-8">
          <div className="bg-card border border-line rounded-3xl shadow-card p-4 sm:p-5 order-2 lg:order-none">
            <h2 className="font-display text-lg font-bold text-snow mb-4 flex items-center gap-2.5">
                <div className="w-1.5 h-5 bg-gradient-to-b from-brand-300 to-brand-600 rounded-full"></div>
                Log Your Food
            </h2>
            <div className="relative">
              <textarea
                value={foodInput}
                onChange={(e) => setFoodInput(e.target.value)}
                placeholder="Type or speak — “2 slices of toast”, “Burger King small fry” — or scan a nutrition label"
                className="w-full p-4 pr-11 h-28 sm:h-36 border border-line rounded-2xl focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none resize-none transition-all bg-canvas/60 text-snow placeholder-mist text-[15px] leading-relaxed"
              />
              {foodInput && (
                <button
                  onClick={() => setFoodInput('')}
                  className="absolute top-2.5 right-2.5 w-8 h-8 flex items-center justify-center rounded-lg text-mist hover:text-snow hover:bg-card2 transition-all"
                  title="Clear input"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              {sttService.isSupported() && (
                <button
                  onClick={handleToggleListening}
                  className={`w-12 h-12 shrink-0 flex items-center justify-center rounded-2xl transition-all active:scale-95 ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse shadow-[0_4px_24px_-6px_rgba(244,63,94,0.5)]'
                      : 'bg-card2 border border-line2 text-fog hover:text-snow'
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
                className="w-12 h-12 shrink-0 flex items-center justify-center rounded-2xl bg-card2 border border-line2 text-fog hover:text-snow transition-all active:scale-95"
                title="Scan nutrition label"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
              </button>
              <button
                onClick={() => setShowLiveModal(true)}
                className="w-12 h-12 shrink-0 flex items-center justify-center rounded-2xl bg-card2 border border-line2 text-brand-400 hover:text-brand-300 hover:border-brand-500/40 transition-all active:scale-95"
                title="Live voice logging"
              >
                {/* Broadcast / live icon */}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.5 8.5a5 5 0 000 7m7-7a5 5 0 010 7M5.6 5.6a9 9 0 000 12.8m12.8-12.8a9 9 0 010 12.8" />
                </svg>
              </button>
              <button
                onClick={() => handleEstimate()}
                disabled={isEstimating || !foodInput}
                className="flex-1 h-12 rounded-2xl bg-brand-500 hover:bg-brand-400 text-emerald-950 font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none shadow-glow"
              >
                {isEstimating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Analyzing…
                  </span>
                ) : 'Analyze Food'}
              </button>
            </div>

{/* Favorited Breakdowns */}
            {favoritedBreakdowns.length > 0 && (() => {
              const grouped = groupFavoritesByCategory(favoritedBreakdowns);
              const activeCategories = CATEGORIES.filter(cat => grouped.get(cat.key)!.length > 0);

              if (selectedCategory) {
                const catFavs = grouped.get(selectedCategory)!;
                const catInfo = CATEGORIES.find(c => c.key === selectedCategory)!;
                return (
                  <div className="mt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => setSelectedCategory(null)}
                        className="w-8 h-8 -ml-1.5 flex items-center justify-center rounded-lg text-mist hover:text-snow hover:bg-card2 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                      </button>
                      <p className="text-[11px] font-semibold text-mist uppercase tracking-[0.14em]">{catInfo.emoji} {catInfo.label}</p>
                    </div>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mb-2">
                      {catFavs.map((favorite) => (
                        <div key={favorite.id} className="relative group">
                          {editingFavorite === favorite.id ? (
                            <div className="flex items-center gap-1 px-3 py-2 bg-card2 rounded-xl border border-line2">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveRename();
                                  if (e.key === 'Escape') cancelRename();
                                }}
                                className="bg-canvas/60 text-snow px-2 py-1 rounded-lg text-sm w-32 outline-none border border-line focus:border-brand-500/60"
                                autoFocus
                              />
                              <button onClick={saveRename} className="p-1.5 text-brand-400 hover:text-brand-300">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                              </button>
                              <button onClick={cancelRename} className="p-1.5 text-mist hover:text-snow">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => useFavoritedBreakdown(favorite)}
                                className={`flex-shrink-0 min-w-fit px-3.5 py-2 bg-card2 text-fog rounded-xl text-sm font-medium transition-all border border-line2 hover:text-snow hover:border-brand-500/40 active:scale-95 ${favorite.userId === user?.id ? 'pr-16' : ''}`}
                              >
                                <span className="whitespace-nowrap">{favorite.name}</span>
                              </button>
                              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                                {favorite.userId === user?.id && (
                                  <>
                                    <button
                                      onClick={() => handleRename(favorite)}
                                      className="p-1 text-mist sm:opacity-0 sm:group-hover:opacity-70 transition-all rounded-md hover:bg-card2 hover:text-snow"
                                      title="Rename favorite"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteFavorite(favorite.id)}
                                      className="p-1 text-mist sm:opacity-0 sm:group-hover:opacity-70 transition-all rounded-md hover:bg-rose-500/20 hover:text-rose-300"
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
                );
              }

              // Category grid
              return (
                <div className="mt-6">
                  <p className="text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-3">Favorites</p>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mb-2">
                    {activeCategories.map((cat) => {
                      const count = grouped.get(cat.key)!.length;
                      return (
                        <button
                          key={cat.key}
                          onClick={() => setSelectedCategory(cat.key)}
                          className="flex-shrink-0 px-3.5 py-2 bg-card2 text-fog rounded-xl text-sm font-medium transition-all border border-line2 hover:text-snow hover:border-brand-500/40 active:scale-95"
                        >
                          <span className="whitespace-nowrap">{cat.emoji} {cat.label} <span className="text-mist">({count})</span></span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {lastEstimate && (
              <div className="mt-6 p-4 sm:p-5 bg-brand-500/[0.06] rounded-3xl border border-brand-500/25 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex justify-between items-start mb-5 gap-3">
                  <div>
                    <h3 className="font-display text-lg font-bold text-brand-300">Breakdown</h3>
                    <p className="text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mt-0.5">AI detected {lastEstimate.items.length} item{lastEstimate.items.length === 1 ? '' : 's'}</p>
                    <div className="flex gap-4 mt-2.5">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold text-sky-400/70 uppercase tracking-[0.12em]">Protein</span>
                        <span className="text-sm font-bold text-sky-400 tabular-nums">{Math.round(breakdownItems.reduce((sum, i, idx) => sum + i.protein * (portionSizes[idx] || 1), 0))}g</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-[0.12em]">Fat</span>
                        <span className="text-sm font-bold text-amber-400 tabular-nums">{Math.round(breakdownItems.reduce((sum, i, idx) => sum + i.fat * (portionSizes[idx] || 1), 0))}g</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold text-violet-400/70 uppercase tracking-[0.12em]">Carbs</span>
                        <span className="text-sm font-bold text-violet-400 tabular-nums">{Math.round(breakdownItems.reduce((sum, i, idx) => sum + i.carbs * (portionSizes[idx] || 1), 0))}g</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={favoriteBreakdown}
                      className="w-11 h-11 flex items-center justify-center rounded-xl text-mist hover:text-rose-400 hover:bg-card2 transition-colors group"
                      title="Save to favorites"
                    >
                      <svg className="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                      </svg>
                    </button>
                    <div className="text-right">
                      <div className="font-display text-3xl font-bold text-brand-300 tabular-nums leading-none">{Math.round(breakdownTotalCalories)}</div>
                      <div className="text-[10px] font-semibold uppercase text-mist tracking-[0.14em] mt-1">Total kcal</div>
                      {lastEstimate.servingSize && (
                        <div className="text-[10px] text-mist mt-1">{lastEstimate.servingSize}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 mb-6">
                  {breakdownItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="relative bg-card p-3.5 sm:p-4 rounded-2xl border border-line hover:border-brand-500/40 transition-all"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBreakdownItem(idx);
                        }}
                        className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-mist hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10 z-10"
                        title="Remove item"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pr-8">
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => handleItemClick(item)}
                      >
                        <p className="font-semibold text-snow text-sm sm:text-base">
                          {item.name}
                          {item.source === 'web' && (
                            <span className="inline-block ml-1.5 text-violet-400" title="Brand verified">
                              <svg className="w-3.5 h-3.5 inline" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                        </p>
                        <div className="flex gap-3 mt-1">
                          <span className="text-[11px] text-sky-400/80 font-semibold tabular-nums">P {Math.round(item.protein * (portionSizes[idx] || 1))}g</span>
                          <span className="text-[11px] text-violet-400/80 font-semibold tabular-nums">C {Math.round(item.carbs * (portionSizes[idx] || 1))}g</span>
                          <span className="text-[11px] text-amber-400/80 font-semibold tabular-nums">F {Math.round(item.fat * (portionSizes[idx] || 1))}g</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                        <select
                          value={portionSizes[idx] || 1}
                          onChange={(e) => {
                            e.stopPropagation();
                            setPortionSizes(prev => ({ ...prev, [idx]: parseFloat(e.target.value) }));
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-9 bg-card2 text-fog text-xs font-semibold rounded-lg px-2 border border-line2 outline-none cursor-pointer tabular-nums"
                        >
                          <option value={0.5}>0.5x</option>
                          <option value={1}>1x</option>
                          <option value={1.5}>1.5x</option>
                          <option value={2}>2x</option>
                        </select>
                        <div className="text-right flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1 justify-end">
                            <select
                              value={Math.round(getAdjustedCalories(item, idx))}
                              onChange={(e) => {
                                e.stopPropagation();
                                const val = parseFloat(e.target.value);
                                setCalorieOverrides(prev => {
                                  const next = [...prev];
                                  next[idx] = val;
                                  return next;
                                });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-9 bg-card2 text-fog text-xs font-semibold rounded-lg px-2 border border-line2 outline-none cursor-pointer tabular-nums"
                            >
                              {(() => {
                                const baseVal = Math.round(item.calories);
                                const currentVal = Math.round(getAdjustedCalories(item, idx));
                                const options = new Set<number>();
                                
                                // Add current value to ensure it's always an option
                                options.add(currentVal);
                                
                                // Calculate increment based on base calories (roughly 5% of base, rounded to nice numbers)
                                const increment = baseVal < 50 ? 5 : baseVal < 100 ? 10 : baseVal < 200 ? 20 : baseVal < 500 ? 25 : 50;
                                
                                // Generate options from 0.5x to 2x of base value
                                const minVal = Math.round(baseVal * 0.5);
                                const maxVal = Math.round(baseVal * 2);
                                
                                for (let val = minVal; val <= maxVal; val += increment) {
                                  if (val > 0) options.add(val);
                                }
                                
                                // Ensure exact 0.5x, 1x, 1.5x, 2x multiples are included
                                [0.5, 1, 1.5, 2].forEach(mult => {
                                  const val = Math.round(baseVal * mult);
                                  if (val > 0) options.add(val);
                                });
                                
                                return Array.from(options).sort((a, b) => a - b).map(opt => (
                                  <option key={opt} value={opt}>
                                    {opt} kcal
                                  </option>
                                ));
                              })()}
                            </select>
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>
                  ))}
                </div>

                {profile?.spouseId && (
                  <label className="flex items-center justify-between gap-4 mb-4 p-3.5 bg-card rounded-2xl border border-line cursor-pointer hover:border-line2 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-snow">Also add to spouse's food</p>
                      <p className="text-[11px] text-mist mt-0.5">Creates the same entries for your spouse</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={addToSpouseFood}
                      onChange={(e) => updateSpouseSharing(e.target.checked)}
                      className="w-5 h-5 accent-emerald-500 shrink-0"
                    />
                  </label>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={addEntry}
                        className="flex-1 h-13 py-3.5 bg-brand-500 hover:bg-brand-400 text-emerald-950 rounded-2xl font-bold text-sm shadow-glow transition-all active:scale-[0.98]"
                    >
                        Confirm {breakdownItems.length > 1 ? 'All Items' : 'Entry'}
                    </button>
                    <button
                        onClick={() => {
                            setLastEstimate(null);
                            resetBreakdownItems();
                            setPortionSizes({});
                            updateSpouseSharing(false);
                        }}
                        className="px-6 py-3.5 bg-card2 text-fog rounded-2xl font-semibold text-sm border border-line2 hover:text-snow transition-all active:scale-[0.98]"
                    >
                        Discard
                    </button>
                </div>
              </div>
            )}
          </div>

          {/* Calorie Progress */}
          <div className={`bg-card p-4 sm:p-5 rounded-3xl shadow-card border order-1 lg:order-none ${isSelectedMaintenance ? 'border-amber-500/40' : 'border-line'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-snow">
                {externalSelectedDate.toDateString() === new Date().toDateString()
                  ? 'Today'
                  : externalSelectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </h2>
              {isSelectedMaintenance && (
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-full whitespace-nowrap"
                  title={`Using maintenance target (${maintenanceCalorieTarget} kcal) instead of weight-loss target (${goalCalorieTarget} kcal).`}
                >
                  ⚖ Maintenance
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#242E29" strokeWidth="9" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke={caloriesRemaining < 0 ? '#FB7185' : isSelectedMaintenance ? '#FBBF24' : '#34D399'}
                    strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 42}
                    strokeDashoffset={(2 * Math.PI * 42) * (1 - Math.min(100, progressPercent) / 100)}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`font-display text-xl sm:text-2xl font-bold tabular-nums leading-none ${caloriesRemaining < 0 ? 'text-rose-400' : 'text-snow'}`}>{Math.round(progressPercent)}<span className="text-sm">%</span></span>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] font-semibold text-mist uppercase tracking-[0.12em]">Eaten</p>
                  <p className="font-display text-xl sm:text-2xl font-bold text-snow tabular-nums">{totalCalories}</p>
                </div>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${caloriesRemaining < 0 ? 'text-rose-400/80' : 'text-brand-400/80'}`}>
                    {caloriesRemaining < 0 ? 'Over by' : 'Left'}
                  </p>
                  <p className={`font-display text-xl sm:text-2xl font-bold tabular-nums ${caloriesRemaining < 0 ? 'text-rose-400' : 'text-brand-400'}`}>
                    {Math.round(Math.abs(caloriesRemaining))}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-mist uppercase tracking-[0.12em]">Target</p>
                  <p className="font-display text-xl sm:text-2xl font-bold text-fog tabular-nums">{dailyCalorieTarget}</p>
                </div>
              </div>
            </div>

            {/* Macro progress */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              {[
                { label: 'Protein', value: totalProtein, target: targetProtein, bar: 'bg-sky-400', text: 'text-sky-400' },
                { label: 'Fat', value: totalFat, target: targetFat, bar: 'bg-amber-400', text: 'text-amber-400' },
                { label: 'Fiber', value: totalFiber, target: targetFiber, bar: 'bg-teal-400', text: 'text-teal-400' },
              ].map((macro) => (
                <div key={macro.label}>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="text-[10px] font-semibold text-mist uppercase tracking-[0.12em]">{macro.label}</span>
                    <span className={`text-[11px] font-bold tabular-nums ${macro.text}`}>{Math.round(macro.value)}<span className="text-mist font-medium">/{macro.target}g</span></span>
                  </div>
                  <div className="w-full bg-card2 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${macro.bar}`}
                      style={{ width: `${Math.min(100, (macro.value / macro.target) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Protein Suggestions */}
            {proteinSuggestions.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => handleSuggestionClick(proteinSuggestions[0])}
                  className="w-full text-left px-3.5 py-2.5 bg-sky-500/10 border border-sky-500/25 rounded-xl text-xs text-sky-300 hover:bg-sky-500/15 hover:border-sky-500/40 transition-all"
                >
                  💡 {proteinSuggestions[0]}
                </button>
              </div>
            )}
          </div>

          {/* Weekly Calorie Tracker */}
          <div className="bg-card p-4 sm:p-5 rounded-3xl shadow-card border border-line order-3 lg:order-none">
            <h2 className="font-display text-lg font-bold text-snow mb-4">Weekly Progress</h2>
            <div className="space-y-2.5">
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
                const weekDateObj = weekDateObjs[index];
                const dayIsMaintenance = weekDateObj ? isDateMaintenance(weekDateObj) : false;
                const dayTarget = dayIsMaintenance ? maintenanceCalorieTarget : goalCalorieTarget;
                const calories = dayData?.totalCalories || 0;
                const percent = Math.min(100, (calories / dayTarget) * 100);
                
                return (
                  <div key={day} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-8 ${isToday ? 'text-brand-400' : 'text-mist'}`}>
                      {day}
                    </span>
                    <div className="flex-1 relative">
                      <div className="w-full bg-card2 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ease-out rounded-full ${
                            calories > dayTarget
                              ? 'bg-rose-500'
                              : dayIsMaintenance
                                ? 'bg-amber-400'
                                : isToday
                                  ? 'bg-brand-400'
                                  : 'bg-sky-500/70'
                          }`}
                          style={{ width: `${Math.min(100, percent)}%` }}
                        ></div>
                      </div>
                    </div>
                    <span className={`text-xs font-bold text-right w-14 whitespace-nowrap tabular-nums ${isToday ? 'text-brand-400' : 'text-fog'}`} title={dayIsMaintenance ? `Maintenance day • target ${dayTarget} kcal` : undefined}>
                      {calories}{dayIsMaintenance ? '⚖' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-line space-y-2">
              {(() => {
                const currentDayOfWeek = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
                const weighDay = profile?.weighDay ?? 1;
                // Calculate today's index in the rotated week (0 = first day of week, 6 = last day)
                let todayIndex = currentDayOfWeek - weighDay;
                if (todayIndex < 0) todayIndex += 7;

                // Per-day targets respecting maintenance day flags
                const perDayTargets = weekDateObjs.map(d => getTargetForDate(d));
                const todayTarget = perDayTargets[todayIndex] ?? goalCalorieTarget;
                const maintenanceDaysCount = perDayTargets.filter((_, i) => {
                  const d = weekDateObjs[i];
                  return d ? isDateMaintenance(d) : false;
                }).length;

                // Get today's calories and check if over target
                const todayCalories = weeklyData[todayIndex]?.totalCalories || 0;
                const isTodayOver = todayCalories > todayTarget;
                
                // Completed days (before today)
                const weeklyTotalBeforeToday = weeklyData.slice(0, todayIndex).reduce((sum, day) => sum + day.totalCalories, 0);
                const weeklyTargetBeforeToday = perDayTargets.slice(0, todayIndex).reduce((sum, t) => sum + t, 0);
                
                // For deficit calculation: use completed days, and include today ONLY if over target
                // If today is over, include today's full calories and target (not just overage)
                const effectiveTotal = weeklyTotalBeforeToday + (isTodayOver ? todayCalories : 0);
                const effectiveTarget = weeklyTargetBeforeToday + (isTodayOver ? todayTarget : 0);
                
                const weeklyTotalSoFar = weeklyData.reduce((sum, day) => sum + day.totalCalories, 0);
                const weeklyTargetThroughToday = perDayTargets.slice(0, todayIndex + 1).reduce((sum, t) => sum + t, 0);
                
                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-mist uppercase tracking-[0.14em]">Weekly Total</span>
                      <span className="text-sm font-bold text-snow tabular-nums">
                        {weeklyTotalSoFar} / {weeklyTargetThroughToday} kcal
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-mist uppercase tracking-[0.14em]">Net Calories</span>
                      <span className={`text-sm font-bold tabular-nums ${
                        effectiveTotal > effectiveTarget ? 'text-rose-400' : 'text-brand-400'
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
                      <span className="text-[11px] font-semibold text-mist uppercase tracking-[0.14em]">Daily Avg</span>
                      <span className="text-sm font-bold text-snow tabular-nums">
                        {todayIndex > 0 ? Math.round(weeklyTotalBeforeToday / todayIndex) : 0} kcal
                      </span>
                    </div>
                    {maintenanceDaysCount > 0 && (
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-[0.14em]">Maintenance Days</span>
                        <span className="text-sm font-bold text-amber-400 tabular-nums">
                          {maintenanceDaysCount} / 7
                        </span>
                      </div>
                    )}
                    {(() => {
                      // Calculate projected weight change based on weekly deficit/surplus
                      // 3500 calories = 1 lb of weight
                      
                      // First, calculate the baseline weight change from the profile's weight goal
                      // Weight goal is negative for loss (e.g., -1000 for 2 lbs/week loss).
                      // Maintenance days contribute zero to the baseline deficit.
                      const weightGoalValue = parseFloat(profile?.weightGoal || '0');
                      const nonMaintenanceDays = 7 - maintenanceDaysCount;
                      const baselineWeeklyDeficit = -weightGoalValue * nonMaintenanceDays;
                      
                      // Then, calculate additional deficit/surplus from eating above/below target
                      // Use effectiveTotal/effectiveTarget which only counts today if over target.
                      // Project per-day variance over the full 7-day week.
                      const daysElapsed = todayIndex + (isTodayOver ? 1 : 0);
                      const additionalDeficit = effectiveTarget - effectiveTotal;
                      const projectedAdditionalDeficit = daysElapsed > 0 ? (additionalDeficit / daysElapsed) * 7 : 0;
                      
                      // Total projected deficit includes both baseline goal and actual performance
                      const totalProjectedDeficit = baselineWeeklyDeficit + projectedAdditionalDeficit;
                      const projectedWeightChange = totalProjectedDeficit / 3500;
                      
                      if (Math.abs(projectedWeightChange) < 0.05) return null; // Don't show if negligible
                      
                      return (
                        <div className={`mt-3 p-3 rounded-xl border ${projectedWeightChange > 0 ? 'bg-brand-500/[0.07] border-brand-500/20' : 'bg-rose-500/[0.07] border-rose-500/20'}`}>
                          <p className="text-xs text-fog leading-relaxed">
                            At your current pace, you should{' '}
                            <span className={`font-bold ${projectedWeightChange > 0 ? 'text-brand-400' : 'text-rose-400'}`}>
                              {projectedWeightChange > 0 ? 'lose' : 'gain'} {Math.abs(projectedWeightChange).toFixed(1)} lbs
                            </span>
                            {' '}this week{projectedWeightChange > 0 ? '! Keep it up' : ''}{profile?.displayName ? `, ${profile.displayName}` : ''}{projectedWeightChange > 0 ? '! 🎉 🎊 🥳' : '. You are going the wrong way! LOCK IN 💪'}
                          </p>
                        </div>
                      );
                    })()}
                    <p className="text-[11px] text-mist mt-3 text-center leading-relaxed">Today's surplus joins Net Calories tomorrow · Daily average excludes today</p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Right Column: Daily Log only */}
        <div className="flex flex-col">
          <div className="bg-card rounded-3xl shadow-card border border-line overflow-hidden flex-1 flex flex-col">
             <div className="p-4 sm:p-5 border-b border-line flex justify-between items-center">
                <h2 className="font-display text-lg font-bold text-snow">Daily Log</h2>
                <span className="text-[11px] font-semibold text-mist uppercase tracking-[0.14em]">{entries.length} Item{entries.length === 1 ? '' : 's'}</span>
             </div>
             <div className="divide-y divide-line flex-1 overflow-y-auto">
                {entries.length === 0 ? (
                  <div className="p-10 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-card2 flex items-center justify-center text-2xl">🍽️</div>
                    <p className="text-mist text-sm">
                      {externalSelectedDate.toDateString() === new Date().toDateString()
                        ? 'Nothing logged yet today.'
                        : `No meals logged on ${externalSelectedDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            timeZone: profile?.timezone || 'UTC'
                          })}.`
                      }
                    </p>
                    {externalSelectedDate.toDateString() === new Date().toDateString() && (
                      <p className="text-mist/70 text-xs mt-1">Log your first meal above.</p>
                    )}
                  </div>
                ) : (
                  entries.map((entry) => (
                    <div key={entry.id} className="px-4 py-3 flex justify-between items-center group transition-all hover:bg-card2/60 cursor-pointer" onClick={() => handleItemClick(entry)}>
                      <div className="flex gap-3 items-center min-w-0 flex-1">
                        <div className="relative shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addToBreakdown(entry);
                            }}
                            className="w-10 h-10 rounded-xl bg-card2 border border-line flex items-center justify-center text-lg hover:border-brand-500/40 transition-colors relative"
                            title="Add to breakdown"
                          >
                            {getFoodEmoji(entry.name)}
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-brand-500 rounded-full flex items-center justify-center text-emerald-950 sm:opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
                              </svg>
                            </div>
                          </button>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-snow text-sm truncate">{entry.name}</p>
                          <p className="text-[10px] text-mist font-medium mt-0.5">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div
                          className="text-right cursor-pointer hover:bg-card2 rounded-lg px-2 py-1.5 transition-colors border border-transparent hover:border-line2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCalorieEdit(entry);
                          }}
                          title="Edit calories"
                        >
                            <span className="font-bold text-snow text-sm tabular-nums">{entry.calories}</span>
                            <span className="text-[9px] font-semibold text-mist uppercase ml-1">kcal</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteEntry(entry.id);
                          }}
                          className="w-9 h-9 flex items-center justify-center text-mist sm:opacity-0 sm:group-hover:opacity-70 transition-all rounded-lg hover:bg-rose-500/15 hover:text-rose-400"
                          title="Delete entry"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-card border border-line rounded-t-3xl sm:rounded-3xl shadow-pop w-full max-w-md max-h-[90dvh] overflow-y-auto p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-in fade-in zoom-in-95 duration-300">
            <div className="w-10 h-1 rounded-full bg-line2 mx-auto mb-4 sm:hidden" />
            <h3 className="font-display text-xl font-bold text-snow mb-3">
              {profile?.spouseId ? 'Remove Spouse' : 'Add Spouse'}
            </h3>
            {!profile?.spouseId ? (
              <React.Fragment>
                <p className="text-fog text-sm mb-4">
                  Enter your spouse's email address to share favorites with each other.
                </p>
                <input
                  type="email"
                  value={spouseEmail}
                  onChange={(e) => setSpouseEmail(e.target.value)}
                  placeholder="spouse@example.com"
                  className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
                />
                {spouseError && (
                  <p className="text-rose-300 text-sm mt-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">{spouseError}</p>
                )}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleAddSpouse}
                    className="flex-1 h-12 bg-brand-500 hover:bg-brand-400 text-emerald-950 rounded-2xl font-bold text-sm shadow-glow transition-all active:scale-[0.98]"
                  >
                    Add Spouse
                  </button>
                  <button
                    onClick={() => {
                      externalSetShowSpouseModal(false);
                      setSpouseEmail('');
                      setSpouseError('');
                    }}
                    className="flex-1 h-12 bg-card2 text-fog rounded-2xl font-semibold text-sm border border-line2 hover:text-snow transition-all active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                </div>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <p className="text-fog text-sm mb-6">
                  Are you sure you want to remove your spouse? This will stop sharing favorites.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleRemoveSpouse}
                    className="flex-1 h-12 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-bold text-sm transition-all active:scale-[0.98]"
                  >
                    Remove Spouse
                  </button>
                  <button
                    onClick={() => externalSetShowSpouseModal(false)}
                    className="flex-1 h-12 bg-card2 text-fog rounded-2xl font-semibold text-sm border border-line2 hover:text-snow transition-all active:scale-[0.98]"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={closeInsightModal}>
          <div
            className="bg-card rounded-t-3xl sm:rounded-3xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-md w-full max-h-[90dvh] overflow-y-auto border border-line shadow-pop animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-line2 mx-auto mb-4 sm:hidden" />
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-display text-xl font-bold text-snow">{selectedItem.name}</h3>
                <div className="flex gap-4 mt-2.5">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold text-mist uppercase tracking-[0.12em]">Calories</span>
                    <span className="text-sm font-bold text-snow tabular-nums">{selectedItem.calories} kcal</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold text-sky-400/70 uppercase tracking-[0.12em]">Protein</span>
                    <span className="text-sm font-bold text-sky-400 tabular-nums">{selectedItem.protein}g</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-[0.12em]">Fat</span>
                    <span className="text-sm font-bold text-amber-400 tabular-nums">{selectedItem.fat}g</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold text-violet-400/70 uppercase tracking-[0.12em]">Carbs</span>
                    <span className="text-sm font-bold text-violet-400 tabular-nums">{selectedItem.carbs}g</span>
                  </div>
                </div>
              </div>
              <button
                onClick={closeInsightModal}
                className="w-9 h-9 -mr-1 flex items-center justify-center rounded-lg text-mist hover:text-snow hover:bg-card2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {isLoadingInsight ? (
              <div className="flex flex-col items-center justify-center py-8">
                <svg className="animate-spin h-8 w-8 text-brand-400 mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-fog text-sm">Getting AI insights…</p>
              </div>
            ) : itemInsight ? (
              <div className="space-y-4">
                <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-[0.12em] border ${
                  itemInsight.verdict === 'healthy' ? 'bg-brand-500/10 text-brand-300 border-brand-500/25' :
                  itemInsight.verdict === 'moderate' ? 'bg-amber-500/10 text-amber-300 border-amber-500/25' :
                  'bg-rose-500/10 text-rose-300 border-rose-500/25'
                }`}>
                  {itemInsight.verdict}
                </div>

                <p className="text-fog text-sm leading-relaxed">{itemInsight.summary}</p>

                <div className="space-y-2">
                  {itemInsight.highlights.map((highlight, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className={`mt-0.5 ${highlight.isPositive ? 'text-brand-400' : 'text-rose-400'}`}>
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
                      <span className="text-fog text-sm">{highlight.text}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-card2 border border-line rounded-xl p-3.5 mt-4">
                  <p className="text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1">💡 Tip</p>
                  <p className="text-fog text-sm">{itemInsight.tip}</p>
                </div>
              </div>
            ) : (
              <p className="text-mist text-center py-4">Failed to load insights. Tap to try again.</p>
            )}
          </div>
        </div>
      )}

      {/* Protein Suggestion Detail Modal */}
      {selectedSuggestion && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={closeSuggestionModal}>
          <div
            className="bg-card rounded-t-3xl sm:rounded-3xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-md w-full max-h-[90dvh] overflow-y-auto border border-line shadow-pop animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-line2 mx-auto mb-4 sm:hidden" />
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-display text-xl font-bold text-sky-400">💡 Protein Boost</h3>
                <p className="text-sm text-fog mt-1">{selectedSuggestion}</p>
              </div>
              <button
                onClick={closeSuggestionModal}
                className="w-9 h-9 -mr-1 flex items-center justify-center rounded-lg text-mist hover:text-snow hover:bg-card2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {isLoadingSuggestionDetail ? (
              <div className="flex flex-col items-center justify-center py-8">
                <svg className="animate-spin h-8 w-8 text-sky-400 mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-fog text-sm">Getting details…</p>
              </div>
            ) : suggestionDetail ? (
              <div className="space-y-4">
                <p className="text-fog text-sm leading-relaxed">{suggestionDetail.summary}</p>

                <div className="space-y-2">
                  {suggestionDetail.highlights.map((highlight, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className={`mt-0.5 ${highlight.isPositive ? 'text-sky-400' : 'text-amber-400'}`}>
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
                      <span className="text-fog text-sm">{highlight.text}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-sky-500/10 rounded-xl p-3.5 mt-4 border border-sky-500/25">
                  <p className="text-[11px] font-semibold text-sky-400 uppercase tracking-[0.14em] mb-1">💡 Quick Tip</p>
                  <p className="text-fog text-sm">{suggestionDetail.tip}</p>
                </div>

                <button
                  onClick={() => {
                    if (selectedSuggestion) {
                      closeSuggestionModal();
                      handleEstimate(selectedSuggestion);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className="w-full mt-4 h-12 bg-brand-500 hover:bg-brand-400 text-emerald-950 rounded-2xl font-bold text-sm shadow-glow transition-all active:scale-[0.98]"
                >
                  Add to Log
                </button>
              </div>
            ) : (
              <p className="text-mist text-center py-4">Failed to load details. Tap to try again.</p>
            )}
          </div>
        </div>
      )}

      {/* Calorie Edit Modal */}
      {editingCalorieEntry && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={closeCalorieEdit}>
          <div
            className="bg-card rounded-t-3xl sm:rounded-3xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-sm w-full border border-line shadow-pop animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-line2 mx-auto mb-4 sm:hidden" />
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-display text-lg font-bold text-snow">Edit Calories</h3>
                <p className="text-sm text-fog mt-1">{editingCalorieEntry.name}</p>
              </div>
              <button
                onClick={closeCalorieEdit}
                className="w-9 h-9 -mr-1 flex items-center justify-center rounded-lg text-mist hover:text-snow hover:bg-card2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5 block">Calories</label>
                <select
                  value={calorieEditValue}
                  onChange={(e) => setCalorieEditValue(parseFloat(e.target.value))}
                  className="w-full h-12 px-4 bg-canvas/60 text-snow rounded-2xl border border-line focus:border-brand-500/60 outline-none cursor-pointer font-semibold tabular-nums"
                >
                  {(() => {
                    const baseVal = editingCalorieEntry.calories;
                    const currentVal = calorieEditValue;
                    const options = new Set<number>();
                    
                    // Add current value to ensure it's always an option
                    options.add(currentVal);
                    
                    // Calculate increment based on base calories (roughly 5% of base, rounded to nice numbers)
                    const increment = baseVal < 50 ? 5 : baseVal < 100 ? 10 : baseVal < 200 ? 20 : baseVal < 500 ? 25 : 50;
                    
                    // Generate options from 0.5x to 2x of base value
                    const minVal = Math.round(baseVal * 0.5);
                    const maxVal = Math.round(baseVal * 2);
                    
                    for (let val = minVal; val <= maxVal; val += increment) {
                      if (val > 0) options.add(val);
                    }
                    
                    // Ensure exact 0.5x, 1x, 1.5x, 2x multiples are included
                    [0.5, 1, 1.5, 2].forEach(mult => {
                      const val = Math.round(baseVal * mult);
                      if (val > 0) options.add(val);
                    });
                    
                    return Array.from(options).sort((a, b) => a - b).map(opt => (
                      <option key={opt} value={opt}>
                        {opt} kcal
                      </option>
                    ));
                  })()}
                </select>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSaveCalorieEdit}
                  className="flex-1 h-12 bg-brand-500 hover:bg-brand-400 text-emerald-950 rounded-2xl font-bold text-sm shadow-glow transition-all active:scale-[0.98]"
                >
                  Save
                </button>
                <button
                  onClick={closeCalorieEdit}
                  className="flex-1 h-12 bg-card2 text-fog rounded-2xl font-semibold text-sm border border-line2 hover:text-snow transition-all active:scale-[0.98]"
                >
                  Cancel
                </button>
              </div>
            </div>
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

      {/* Live Voice Logging Modal */}
      <LiveFoodModal
        isOpen={showLiveModal}
        onClose={() => setShowLiveModal(false)}
        onFoodLogged={handleLiveFoodLogged}
        onLogFavorite={(name) => liveLogFavoriteRef.current(name)}
        onConfirmEntries={() => liveConfirmRef.current()}
        onSetSpouseSharing={updateSpouseSharing}
        hasSpouse={!!profile?.spouseId}
        voice={liveVoice}
        context={showLiveModal ? buildLiveContext() : undefined}
      />

      {/* Previous Day Warning Modal */}
      {showPreviousDayWarning && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] rounded-t-3xl sm:rounded-3xl shadow-pop border border-line w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
            <div className="w-10 h-1 rounded-full bg-line2 mx-auto mb-4 sm:hidden" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/25 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="font-display text-lg font-bold text-snow">Logging for a Previous Day</h3>
            </div>
            <p className="text-fog text-sm mb-6">
              You're about to add food entries for {externalSelectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.
              Are you sure you want to continue?
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowPreviousDayWarning(false)}
                className="flex-1 h-12 bg-card2 text-fog rounded-2xl font-semibold text-sm border border-line2 hover:text-snow transition-all active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                onClick={addEntryToToday}
                className="flex-1 h-12 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-bold text-sm transition-all active:scale-[0.98]"
              >
                Add to Today
              </button>
              <button
                onClick={confirmAddEntry}
                className="flex-1 h-12 bg-brand-500 hover:bg-brand-400 text-emerald-950 rounded-2xl font-bold text-sm shadow-glow transition-all active:scale-[0.98]"
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
