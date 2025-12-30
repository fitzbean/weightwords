import { createClient } from '@supabase/supabase-js';
import { 
  UserProfile, 
  FoodLog, 
  FoodEntry, 
  NutritionEstimate, 
  FoodItemEstimate,
  FavoritedBreakdown,
  Gender,
  WeightGoal,
  ActivityLevel
} from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth functions
export const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) {
    console.error('Sign in error:', error);
  }
  
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Profile functions
export const getProfile = async (userId: string): Promise<UserProfile | null> => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  console.log('Profile query result:', { data, error });
  
  if (error || !data) {
    console.error('Profile error:', error);
    return null;
  }
  
  const profile = {
    age: data.age,
    gender: data.gender as Gender,
    weightLbs: data.weight_lbs,
    heightFt: data.height_ft,
    heightIn: data.height_in,
    weightGoal: data.weight_goal as WeightGoal,
    dailyCalorieTarget: data.daily_calorie_target,
    activityLevel: data.activity_level as ActivityLevel,
    profileCompleted: data.profile_completed ?? false,
    spouseId: data.spouse_id,
  };
  
  console.log('Mapped profile:', profile);
  
  return profile;
};

export const updateProfile = async (userId: string, profile: UserProfile) => {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      age: profile.age,
      gender: profile.gender,
      weight_lbs: profile.weightLbs,
      height_ft: profile.heightFt,
      height_in: profile.heightIn,
      weight_goal: profile.weightGoal.toString(),
      daily_calorie_target: profile.dailyCalorieTarget,
      activity_level: profile.activityLevel.toString(),
      profile_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();
  
  return { data, error };
};

// Food log functions
export const getFoodLogs = async (userId: string, date?: Date): Promise<FoodLog[]> => {
  let query = supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (date) {
    const dateStr = date.toISOString().split('T')[0];
    query = query.eq('date', dateStr);
  }
  
  const { data, error } = await query;
  
  if (error || !data) return [];
  
  return data.map(log => ({
    id: log.id,
    name: log.name,
    calories: log.calories,
    protein: log.protein,
    carbs: log.carbs,
    fat: log.fat,
    description: log.description,
    date: new Date(log.date),
  }));
};

export const addFoodLog = async (userId: string, log: Omit<FoodLog, 'id' | 'date'>) => {
  const { data, error } = await supabase
    .from('food_logs')
    .insert({
      user_id: userId,
      name: log.name,
      calories: log.calories,
      protein: log.protein,
      carbs: log.carbs,
      fat: log.fat,
      description: log.description,
      date: new Date().toISOString().split('T')[0],
    })
    .select()
    .single();
  
  return { data, error };
};

export const deleteFoodLog = async (logId: string) => {
  const { error } = await supabase
    .from('food_logs')
    .delete()
    .eq('id', logId);
  
  return { error };
};

// Listen to auth changes
export const onAuthStateChange = (callback: (user: any) => void) => {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
};

// Favorited breakdown functions
export const getFavoritedBreakdowns = async (userId: string): Promise<FavoritedBreakdown[]> => {
  const { data, error } = await supabase
    .from('favorited_breakdowns')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error || !data) return [];
  
  return data.map(item => ({
    id: item.id,
    name: item.name,
    breakdown: item.breakdown as FoodItemEstimate[],
    totalCalories: item.total_calories,
    createdAt: new Date(item.created_at).getTime(),
  }));
};

export const addFavoritedBreakdown = async (userId: string, breakdown: Omit<FavoritedBreakdown, 'id' | 'createdAt'>) => {
  const { data, error } = await supabase
    .from('favorited_breakdowns')
    .insert({
      user_id: userId,
      name: breakdown.name,
      breakdown: breakdown.breakdown,
      total_calories: breakdown.totalCalories,
    })
    .select()
    .single();
  
  return { data, error };
};

export const deleteFavoritedBreakdown = async (breakdownId: string) => {
  const { error } = await supabase
    .from('favorited_breakdowns')
    .delete()
    .eq('id', breakdownId);
  
  return { error };
};

export const updateFavoritedBreakdown = async (breakdownId: string, updates: { name: string }) => {
  const { data, error } = await supabase
    .from('favorited_breakdowns')
    .update({
      name: updates.name,
    })
    .eq('id', breakdownId)
    .select()
    .single();
  
  return { data, error };
};

// Spouse functions
export const addSpouse = async (userId: string, spouseEmail: string) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  
  // Find user by email using edge function
  const response = await fetch(`${supabaseUrl}/functions/v1/find-user-by-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ email: spouseEmail }),
  });

  if (!response.ok) {
    const error = await response.json();
    return { data: null, error: new Error(error.error || 'User not found') };
  }

  const { userId: spouseProfileId } = await response.json();
  
  // Update current user's profile with spouse ID
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ spouse_id: spouseProfileId })
    .eq('id', userId)
    .select()
    .single();
  
  // Also update spouse's profile to create bidirectional relationship
  if (data) {
    await supabase
      .from('user_profiles')
      .update({ spouse_id: userId })
      .eq('id', spouseProfileId);
  }
  
  return { data, error };
};

export const getSharedFavoritedBreakdowns = async (userId: string): Promise<FavoritedBreakdown[]> => {
  const { data, error } = await supabase
    .rpc('get_shared_favorites', { 
      current_user_id: userId 
    });
  
  console.log('Shared favorites query:', { data, error, userId });
  
  if (error || !data) return [];
  
  return data.map(item => ({
    id: item.id,
    name: item.name,
    breakdown: item.breakdown as FoodItemEstimate[],
    totalCalories: item.total_calories,
    createdAt: new Date(item.created_at).getTime(),
  }));
};

export const removeSpouse = async (userId: string) => {
  // Get current profile to find spouse
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('spouse_id')
    .eq('id', userId)
    .single();
  
  if (profile?.spouse_id) {
    // Remove spouse reference from both users
    await supabase
      .from('user_profiles')
      .update({ spouse_id: null })
      .eq('id', userId);
    
    await supabase
      .from('user_profiles')
      .update({ spouse_id: null })
      .eq('id', profile.spouse_id);
  }
  
  return { error: null };
};
