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
  ActivityLevel,
  WeighIn
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
    timezone: data.timezone ?? 'UTC',
    isAdmin: data.is_admin ?? false,
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
      timezone: profile.timezone || 'UTC',
      spouse_id: profile.spouseId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();
  
  return { data, error };
};

// Helper functions for timezone handling
const getLocalDateString = (date: Date, timezone: string): string => {
  // Use Intl.DateTimeFormat to get the correct date parts in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // en-CA format gives us YYYY-MM-DD directly
  return formatter.format(date);
};

// Food log functions
export const getFoodLogs = async (userId: string, date?: Date, timezone?: string): Promise<FoodLog[]> => {
  let query = supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (date) {
    // Use timezone to get the correct date string
    const dateStr = timezone 
      ? getLocalDateString(date, timezone)
      : date.toISOString().split('T')[0];
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
    createdAt: new Date(log.created_at),
  }));
};

export const addFoodLog = async (userId: string, log: Omit<FoodLog, 'id' | 'date' | 'createdAt'>, timezone?: string) => {
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
      date: timezone ? getLocalDateString(new Date(), timezone) : new Date().toISOString().split('T')[0],
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

export const getWeeklyFoodLogs = async (userId: string, weekDates: Date[], timezone?: string): Promise<{ date: string; entries: FoodLog[]; totalCalories: number }[]> => {
  const results = [];
  
  for (const date of weekDates) {
    const dateStr = timezone 
      ? getLocalDateString(date, timezone)
      : date.toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      const entries: FoodLog[] = data.map(log => ({
        id: log.id,
        name: log.name,
        calories: log.calories,
        protein: log.protein,
        carbs: log.carbs,
        fat: log.fat,
        description: log.description,
        date: new Date(log.date),
        createdAt: new Date(log.created_at),
      }));
      
      const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);
      
      results.push({
        date: dateStr,
        entries,
        totalCalories,
      });
    } else {
      results.push({
        date: dateStr,
        entries: [],
        totalCalories: 0,
      });
    }
  }
  
  return results;
};

// Listen to auth changes
export const onAuthStateChange = (callback: (user: any) => void) => {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
};

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
    userId: item.user_id
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
    userId: item.user_id,
  }));
};

export const getSpouseEmail = async (spouseId: string): Promise<string | null> => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/get-user-by-id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ userId: spouseId }),
    });

    if (!response.ok) {
      console.error('Error fetching spouse email:', response.statusText);
      return null;
    }

    const data = await response.json();
    return data.email || null;
  } catch (error) {
    console.error('Error fetching spouse email:', error);
    return null;
  }
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

// Weigh-in functions
export const getWeighIns = async (userId: string): Promise<WeighIn[]> => {
  const { data, error } = await supabase
    .from('weigh_ins')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });
  
  if (error || !data) return [];
  
  return data.map(w => ({
    id: w.id,
    userId: w.user_id,
    weightLbs: parseFloat(w.weight_lbs),
    date: new Date(w.date),
    createdAt: new Date(w.created_at),
    updatedAt: new Date(w.updated_at),
  }));
};

export const addWeighIn = async (userId: string, weightLbs: number, date: Date): Promise<{ data?: WeighIn; error: any }> => {
  const dateStr = date.toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('weigh_ins')
    .upsert({
      user_id: userId,
      weight_lbs: weightLbs,
      date: dateStr,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,date'
    })
    .select()
    .single();
  
  if (error) return { error };
  
  return {
    data: {
      id: data.id,
      userId: data.user_id,
      weightLbs: parseFloat(data.weight_lbs),
      date: new Date(data.date),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    },
    error: null
  };
};

export const deleteWeighIn = async (weighInId: string): Promise<{ error: any }> => {
  const { error } = await supabase
    .from('weigh_ins')
    .delete()
    .eq('id', weighInId);
  
  return { error };
};

// Admin functions
export const getAllUsers = async (): Promise<Array<{id: string, email: string, profile: UserProfile | null}>> => {
  // Use the RPC function to get all users with their profiles
  const { data, error } = await supabase.rpc('get_all_users_with_profiles');
  
  if (error) {
    console.error('Error fetching users:', error);
    return [];
  }
  
  return (data || []).map((userData: any) => ({
    id: userData.user_id,
    email: userData.user_email || 'No email',
    profile: userData.user_age ? {
      age: userData.user_age,
      gender: userData.user_gender as Gender,
      weightLbs: userData.user_weight_lbs,
      heightFt: userData.user_height_ft,
      heightIn: userData.user_height_in,
      weightGoal: userData.user_weight_goal as WeightGoal,
      dailyCalorieTarget: userData.user_daily_calorie_target,
      activityLevel: userData.user_activity_level as ActivityLevel,
      profileCompleted: userData.user_profile_completed ?? false,
      spouseId: userData.user_spouse_id,
      timezone: userData.user_timezone ?? 'UTC',
      isAdmin: userData.user_is_admin ?? false,
    } : null
  }));
};

export const getUserById = async (userId: string): Promise<UserProfile | null> => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error || !data) return null;
  
  return {
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
    timezone: data.timezone ?? 'UTC',
    isAdmin: data.is_admin ?? false,
  };
};
