
import React, { useState, useEffect } from 'react';
import { UserProfile, FoodLog, FoodItemEstimate } from './types';
import ProfileModal from './components/ProfileModal';
import Dashboard from './components/Dashboard';
import AuthForm from './components/AuthForm';
import WeighInModal from './components/WeighInModal';
import AdminModal from './components/AdminModal';
import CalorieHistoryModal from './components/CalorieHistoryModal';
import { supabase, getCurrentUser, getProfile, updateProfile, signOut, onAuthStateChange, getSpouseInfo, getFoodLogs, getMaintenanceDays, addMaintenanceDay, removeMaintenanceDay, syncMaintenanceDaysFromLocalStorage } from './services/supabaseService';
import { APP_CONFIG } from './appConfig';
import { getLocalDateKey } from './utils/dateUtils';

const MAINTENANCE_DAYS_STORAGE_KEY = 'weightwords_maintenance_days';

const Logo: React.FC = () => (
  <div className="flex items-center gap-2.5 min-w-0">
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-glow shrink-0">
      <svg className="w-5 h-5 text-emerald-950" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"></path></svg>
    </div>
    <span className="font-display text-lg font-bold tracking-tight text-snow whitespace-nowrap">
      {APP_CONFIG.app.name}<span className="text-brand-400">{APP_CONFIG.app.nameHighlight}</span>
    </span>
    <span className="hidden xs:inline-block sm:inline-block text-[10px] font-bold uppercase tracking-[0.14em] text-brand-300 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 rounded-md">{APP_CONFIG.app.tagline}</span>
  </div>
);

const loadMaintenanceDays = (userId: string | undefined): Set<string> => {
  if (!userId || typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(`${MAINTENANCE_DAYS_STORAGE_KEY}:${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
};

const saveMaintenanceDays = (userId: string | undefined, days: Set<string>) => {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      `${MAINTENANCE_DAYS_STORAGE_KEY}:${userId}`,
      JSON.stringify(Array.from(days))
    );
  } catch {
    // ignore storage errors
  }
};

const App: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authView, setAuthView] = useState<'signin' | 'signup'>('signin');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showSpouseModal, setShowSpouseModal] = useState(false);
  const [spouseEmail, setSpouseEmail] = useState<string | null>(null);
  const [spouseProfile, setSpouseProfile] = useState<UserProfile | null>(null);
  const [showWeighInModal, setShowWeighInModal] = useState(false);
  const [showCalorieHistoryModal, setShowCalorieHistoryModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    // Initialize with current date in user's local timezone
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  
  // Admin state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<{ id: string; profile: UserProfile } | null>(null);
  const [adminProfile, setAdminProfile] = useState<UserProfile | null>(null);
  
  // Spouse Today state
  const [showSpouseTodayMenu, setShowSpouseTodayMenu] = useState(false);
  const [spouseFoods, setSpouseFoods] = useState<FoodLog[]>([]);
  const [isLoadingSpouseFoods, setIsLoadingSpouseFoods] = useState(false);
  const [itemToAdd, setItemToAdd] = useState<FoodItemEstimate | null>(null);

  // Maintenance Day state (per-date flags stored in localStorage per user)
  const [maintenanceDays, setMaintenanceDays] = useState<Set<string>>(new Set());

  // Load maintenance days from DB whenever the effective user changes
  useEffect(() => {
    const effectiveUserId = impersonatedUser?.id || user?.id;
    if (!effectiveUserId) return;

    const loadMaintenanceDaysFromDB = async () => {
      // First, sync any localStorage entries to DB (one-time migration)
      const localStorageDays = loadMaintenanceDays(effectiveUserId);
      if (localStorageDays.size > 0) {
        const syncResult = await syncMaintenanceDaysFromLocalStorage(effectiveUserId, localStorageDays);
        if (syncResult.synced > 0) {
          // Clear localStorage after successful sync
          try {
            window.localStorage.removeItem(`${MAINTENANCE_DAYS_STORAGE_KEY}:${effectiveUserId}`);
          } catch {
            // ignore
          }
        }
      }

      // Load from DB
      const dbDays = await getMaintenanceDays(effectiveUserId);
      setMaintenanceDays(dbDays);
    };

    loadMaintenanceDaysFromDB();
  }, [user?.id, impersonatedUser?.id]);

  const toggleMaintenanceDay = async (date: Date) => {
    const effectiveUserId = impersonatedUser?.id || user?.id;
    if (!effectiveUserId) return;
    const key = getLocalDateKey(date);

    setMaintenanceDays(prev => {
      const next = new Set<string>(prev);
      if (next.has(key)) {
        next.delete(key);
        removeMaintenanceDay(effectiveUserId, key);
      } else {
        next.add(key);
        addMaintenanceDay(effectiveUserId, key);
      }
      return next;
    });
  };

  useEffect(() => {
    let isInitialized = false;
    
    // Initialize auth state
    const initAuth = async () => {
      try {
        const currentUser = await getCurrentUser();
        
        // Only set user if email is confirmed
        if (currentUser && currentUser.email_confirmed_at) {
          const userProfile = await getProfile(currentUser.id);
          
          // If user exists but profile doesn't, there's a stale session - sign out
          if (!userProfile) {
            console.log('Stale session detected - signing out');
            await signOut();
            setUser(null);
            setProfile(null);
            setIsLoading(false);
            isInitialized = true;
            return;
          }
          
          // Set both user and profile together to avoid flash
          const profileToSet = userProfile.profileCompleted ? userProfile : null;
          
          // Always set the user if authenticated
          setUser(currentUser);
          
          // Check if user needs to complete profile
          if (currentUser && !userProfile.profileCompleted) {
            setIsNewUser(true);
            setShowProfileModal(true);
          }
          
          // Set profile (will be null if not completed)
          setProfile(profileToSet);
        } else {
          // No valid user - ensure clean state
          setUser(null);
          setProfile(null);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        // On error, ensure clean state
        setUser(null);
        setProfile(null);
      } finally {
        setIsLoading(false);
        isInitialized = true;
      }
    };
    
    initAuth();
    
    // Listen for auth changes
    const { data: { subscription } } = onAuthStateChange(async (authUser) => {
      // Skip if not initialized yet (initial load handles this)
      if (!isInitialized) return;
      
      // Only set user if email is confirmed
      if (authUser) {
        const userProfile = await getProfile(authUser.id);
        
        // Set both user and profile together to avoid flash
        const profileToSet = userProfile?.profileCompleted ? userProfile : null;
        
        // Always set the user if authenticated
        setUser(authUser);
        
        // Check if user needs to complete profile
        if (authUser && userProfile && !userProfile.profileCompleted) {
          setIsNewUser(true);
          setShowProfileModal(true);
        }
        
        // Set profile (will be null if not completed)
        setProfile(profileToSet);
      } else {
        setUser(null);
        setProfile(null);
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

  // Fetch spouse profile and email when profile changes or when impersonating
  useEffect(() => {
    const fetchSpouseData = async () => {
      const effectiveProfile = impersonatedUser?.profile || profile;
      if (effectiveProfile?.spouseId) {
        const spouseInfo = await getSpouseInfo(effectiveProfile.spouseId);
        setSpouseEmail(spouseInfo.email);
        // Create a minimal profile object with just displayName for the UI
        if (spouseInfo.displayName) {
          setSpouseProfile({ displayName: spouseInfo.displayName } as UserProfile);
        } else {
          setSpouseProfile(null);
        }
      } else {
        setSpouseEmail(null);
        setSpouseProfile(null);
      }
    };

    fetchSpouseData();
  }, [profile, impersonatedUser]);

  /*
  // Periodically check if profile still exists (handles case where DB is cleared while logged in)
  useEffect(() => {
    if (!user || !profile) return;

    const checkProfileExists = async () => {
      const userProfile = await getProfile(user.id);
      if (!userProfile) {
        console.log('Profile no longer exists - signing out');
        await signOut();
        setUser(null);
        setProfile(null);
      }
    };

    // Check immediately
    checkProfileExists();

    // Check every 30 seconds
    const interval = setInterval(checkProfileExists, 30000);
    return () => clearInterval(interval);
  }, [user, profile]);
  */
  const handleSaveProfile = async (newProfile: UserProfile) => {
    if (!user) return;
    
    // Check if profile exists first
    const existingProfile = await getProfile(user.id);
    
    let error;
    if (existingProfile) {
      const result = await updateProfile(user.id, newProfile);
      error = result.error;
    } else {
      // Create new profile if it doesn't exist
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          id: user.id,
          age: newProfile.age,
          gender: newProfile.gender,
          weight_lbs: newProfile.weightLbs,
          height_ft: newProfile.heightFt,
          height_in: newProfile.heightIn,
          weight_goal: newProfile.weightGoal.toString(),
          daily_calorie_target: newProfile.dailyCalorieTarget,
          activity_level: newProfile.activityLevel.toString(),
          profile_completed: true,
          display_name: newProfile.displayName,
          target_weight_lbs: newProfile.targetWeightLbs,
        });
      error = insertError;
    }

    if (!error) {
      setProfile(newProfile);
      setShowProfileModal(false);
      setIsEditingProfile(false);
      setIsNewUser(false);
    } else {
      console.error('Error saving profile:', error);
      alert('Failed to save profile. Please try again.');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserMenu && !(event.target as Element).closest('.user-menu')) {
        setShowUserMenu(false);
        setShowSpouseTodayMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  // Helper function to get today's date at midnight
  const getToday = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  };

  const handleLogout = async () => {
    await signOut();
  };

  const handleEditProfile = () => {
    setIsNewUser(false);
    setShowProfileModal(true);
    setShowUserMenu(false);
  };

  const handleImpersonate = async (userId: string, userProfile: UserProfile) => {
    // Store the current admin profile if not already impersonating
    if (!impersonatedUser && profile?.isAdmin) {
      setAdminProfile(profile);
    }
    setImpersonatedUser({ id: userId, profile: userProfile });
    setShowUserMenu(false);
  };

  const handleStopImpersonating = () => {
    setImpersonatedUser(null);
    // Restore admin profile
    if (adminProfile) {
      setProfile(adminProfile);
    }
  };

  const handleSpouseTodayClick = async () => {
    const effectiveProfile = impersonatedUser?.profile || profile;
    if (!effectiveProfile?.spouseId) return;
    
    if (showSpouseTodayMenu) {
      setShowSpouseTodayMenu(false);
      return;
    }
    
    setShowSpouseTodayMenu(true);
    setIsLoadingSpouseFoods(true);
    
    try {
      const foods = await getFoodLogs(effectiveProfile.spouseId, selectedDate, effectiveProfile.timezone);
      setSpouseFoods(foods);
    } catch (error) {
      console.error('Error loading spouse foods:', error);
      setSpouseFoods([]);
    } finally {
      setIsLoadingSpouseFoods(false);
    }
  };

  const handleAddSpouseFood = (food: FoodLog) => {
    setItemToAdd({
      name: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-line border-t-brand-400"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-canvas text-snow">
        <nav className="bg-canvas/80 backdrop-blur-xl border-b border-line py-3 px-4 sm:px-6 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <Logo />
          </div>
        </nav>

        <div className="py-12 sm:py-16 px-4">
          <div className="animate-in fade-in duration-500 translate-y-0">
            <div className="text-center mb-10 sm:mb-14 max-w-2xl mx-auto">
                <h1 className="font-display text-4xl md:text-6xl font-bold text-snow mb-5 leading-[1.1] tracking-tight">
                  {APP_CONFIG.hero.title}<br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-300 to-brand-500">{APP_CONFIG.hero.titleHighlight}</span>
                </h1>
                <p className="text-base sm:text-lg text-fog max-w-md mx-auto">{APP_CONFIG.hero.description}</p>
            </div>
            <AuthForm
              view={authView}
              onViewChange={setAuthView}
              onAuthSuccess={(user) => setUser(user)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-snow">
      <nav className="bg-canvas/80 backdrop-blur-xl border-b border-line py-2.5 px-3 sm:py-3 sm:px-6 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center gap-2 sm:gap-4">
          <div className="hidden sm:block"><Logo /></div>
          <div className="sm:hidden flex items-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shrink-0">
              <svg className="w-4.5 h-4.5 text-emerald-950" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"></path></svg>
            </div>
          </div>

          {profile && (
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
               <div className="flex items-center gap-0.5 bg-card border border-line rounded-full p-1">
                  <button
                    onClick={() => {
                      const newDate = new Date(selectedDate);
                      newDate.setDate(newDate.getDate() - 1);
                      setSelectedDate(newDate);
                    }}
                    aria-label="Previous day"
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-mist hover:text-snow hover:bg-card2 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <p className="px-1 font-display text-xs sm:text-sm font-semibold text-fog whitespace-nowrap tabular-nums">
                    <span className="sm:hidden">{selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span className="hidden sm:inline">{selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </p>
                  {selectedDate.getTime() !== getToday().getTime() && (
                    <button
                      onClick={() => {
                        const newDate = new Date(selectedDate);
                        newDate.setDate(newDate.getDate() + 1);
                        setSelectedDate(newDate);
                      }}
                      aria-label="Next day"
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-mist hover:text-snow hover:bg-card2 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                  {selectedDate.getTime() !== getToday().getTime() && (
                    <button
                      onClick={() => setSelectedDate(getToday())}
                      className="h-8 sm:h-9 px-2.5 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-brand-300 bg-brand-500/10 hover:bg-brand-500/20 transition-colors"
                    >
                      Today
                    </button>
                  )}
               </div>
               <div className="relative user-menu">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    aria-label="Account menu"
                    className="w-10 h-10 rounded-full bg-card border border-line flex items-center justify-center hover:border-brand-500/50 hover:bg-card2 transition-colors"
                  >
                    <svg className="w-4.5 h-4.5 text-brand-400" width="18" height="18" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path>
                    </svg>
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-64 bg-card rounded-2xl shadow-pop border border-line py-2 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                      <div className="px-4 py-2.5 border-b border-line">
                        <p className="text-[10px] font-semibold text-mist uppercase tracking-[0.14em]">Signed in as</p>
                        <p className="text-xs font-semibold text-brand-400 truncate mt-0.5">{user?.email}</p>
                      </div>
                      <button
                        onClick={handleEditProfile}
                        className="w-full text-left px-4 py-3 text-sm font-medium text-fog hover:text-snow hover:bg-card2 flex items-center gap-3 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                        </svg>
                        Edit Profile
                      </button>
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowSpouseModal(true);
                        }}
                        className="w-full text-left px-4 py-3 text-sm font-medium text-fog hover:text-snow hover:bg-card2 flex items-center gap-3 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                        </svg>
                        <div className="flex-1">
                          <div>{profile?.spouseId ? 'Remove Spouse' : 'Add Spouse'}</div>
                          {profile?.spouseId && spouseEmail && (
                            <div className="text-xs text-mist font-normal">{spouseEmail}</div>
                          )}
                        </div>
                      </button>
                      {profile?.spouseId && (
                        <div className="relative">
                          <button
                            onClick={handleSpouseTodayClick}
                            className={`w-full text-left px-4 py-3 text-sm font-medium text-fog hover:text-snow hover:bg-card2 flex items-center gap-3 transition-colors ${showSpouseTodayMenu ? 'bg-card2 text-snow' : ''}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
                            </svg>
                            <div className="flex-1">Spouse's Foods</div>
                            <svg className={`w-4 h-4 transition-transform ${showSpouseTodayMenu ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                            </svg>
                          </button>
                          {showSpouseTodayMenu && (
                            <div className="absolute sm:right-full sm:top-0 sm:mr-1 right-0 top-full mt-1 w-64 sm:w-64 bg-card rounded-2xl shadow-pop border border-line py-2 max-h-80 overflow-y-auto z-50">
                              <div className="px-3 py-2 border-b border-line flex justify-between items-center">
                                <p className="text-[10px] font-semibold text-mist uppercase tracking-[0.14em]">
                                  {spouseProfile?.displayName || spouseEmail}'s Log
                                </p>
                                <span className="text-[10px] font-bold text-fog tabular-nums">
                                  {spouseFoods.reduce((sum, f) => sum + f.calories, 0)} kcal
                                </span>
                              </div>
                              {isLoadingSpouseFoods ? (
                                <div className="px-4 py-6 text-center">
                                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-line border-t-brand-400 mx-auto"></div>
                                </div>
                              ) : spouseFoods.length === 0 ? (
                                <div className="px-4 py-4 text-center text-mist text-sm">
                                  No foods logged on this day
                                </div>
                              ) : (
                                spouseFoods.map((food) => (
                                  <button
                                    key={food.id}
                                    onClick={() => handleAddSpouseFood(food)}
                                    className="w-full text-left px-3 py-2.5 hover:bg-card2 transition-colors flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4 text-brand-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                                    </svg>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm text-snow font-medium truncate">{food.name}</div>
                                      <div className="text-xs text-mist tabular-nums">
                                        {food.calories} kcal • P:{food.protein}g C:{food.carbs}g F:{food.fat}g • Fiber:{food.fiber}g
                                      </div>
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowWeighInModal(true);
                        }}
                        className="w-full text-left px-4 py-3 text-sm font-medium text-fog hover:text-snow hover:bg-card2 flex items-center gap-3 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"></path>
                        </svg>
                        Weigh-ins
                      </button>
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowCalorieHistoryModal(true);
                        }}
                        className="w-full text-left px-4 py-3 text-sm font-medium text-fog hover:text-snow hover:bg-card2 flex items-center gap-3 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                        </svg>
                        Calorie history
                      </button>
                      {(() => {
                        const key = getLocalDateKey(selectedDate);
                        const isMaint = maintenanceDays.has(key);
                        const isToday = selectedDate.getTime() === getToday().getTime();
                        const dayLabel = isToday
                          ? 'Today'
                          : selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                        return (
                          <button
                            onClick={() => {
                              toggleMaintenanceDay(selectedDate);
                              setShowUserMenu(false);
                            }}
                            className="w-full text-left px-4 py-3 text-sm font-medium text-fog hover:text-snow hover:bg-card2 flex items-center gap-3 transition-colors"
                          >
                            <svg className={`w-4 h-4 ${isMaint ? 'text-amber-400' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                              {/* Balance scale icon */}
                              <path d="M12 3v18" />
                              <path d="M5 21h14" />
                              <path d="M6 8h12" />
                              <path d="M6 8l-3 7a4 4 0 008 0l-3-7" />
                              <path d="M18 8l-3 7a4 4 0 008 0l-3-7" />
                            </svg>
                            <div className="flex-1">
                              <div>{isMaint ? 'Maintenance Day' : 'Maintenance Day'}</div>
                              <div className="text-xs text-mist font-normal">{dayLabel}</div>
                            </div>
                            {isMaint ? (
                              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">On</span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-mist bg-card2 border border-line px-2 py-0.5 rounded-md">Off</span>
                            )}
                          </button>
                        );
                      })()}
                      {profile?.isAdmin && (
                        <>
                          <hr className="my-1 border-line" />
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              setShowAdminModal(true);
                            }}
                            className="w-full text-left px-4 py-3 text-sm font-medium text-violet-400 hover:bg-card2 flex items-center gap-3 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                            </svg>
                            Admin Panel
                          </button>
                        </>
                      )}
                      <hr className="my-1 border-line" />
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-3 text-sm font-medium text-fog hover:text-snow hover:bg-card2 flex items-center gap-3 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                        </svg>
                        Logout
                      </button>
                    </div>
                  )}
               </div>
            </div>
          )}
        </div>
      </nav>

      <main className="py-5 sm:py-8 px-3 sm:px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {user ? (
          <Dashboard 
            profile={impersonatedUser?.profile || profile} 
            onLogout={handleLogout} 
            showSpouseModal={showSpouseModal}
            setShowSpouseModal={setShowSpouseModal}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            isImpersonating={!!impersonatedUser}
            onStopImpersonating={handleStopImpersonating}
            realProfile={profile}
            impersonatedUserId={impersonatedUser?.id}
            itemToAdd={itemToAdd}
            onItemAdded={() => setItemToAdd(null)}
            maintenanceDays={maintenanceDays}
          />
        ) : (
          <div className="animate-in fade-in duration-500 translate-y-0">
            <div className="text-center mb-10 sm:mb-14 max-w-2xl mx-auto">
                <h1 className="font-display text-4xl md:text-6xl font-bold text-snow mb-5 leading-[1.1] tracking-tight">
                  {APP_CONFIG.hero.title}<br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-300 to-brand-500">{APP_CONFIG.hero.titleHighlight}</span>
                </h1>
                <p className="text-base sm:text-lg text-fog max-w-md mx-auto">{APP_CONFIG.hero.description}</p>
            </div>
            <AuthForm
              view={authView}
              onViewChange={setAuthView}
              onAuthSuccess={() => {}} // Auth state is handled by useEffect
            />
          </div>
        )}
      </main>

      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSave={handleSaveProfile}
        initialData={profile}
        isNewUser={isNewUser}
      />

      <WeighInModal
        isOpen={showWeighInModal}
        onClose={() => setShowWeighInModal(false)}
        userId={user?.id}
        profile={profile}
      />

      <AdminModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        onImpersonate={handleImpersonate}
      />

      <CalorieHistoryModal
        isOpen={showCalorieHistoryModal}
        onClose={() => setShowCalorieHistoryModal(false)}
        userId={impersonatedUser?.id || user?.id}
        profile={impersonatedUser?.profile || profile}
        maintenanceDays={maintenanceDays}
      />

      <footer className="mt-16 border-t border-line py-10 text-center">
         <p className="text-mist/70 text-[11px] font-semibold uppercase tracking-[0.14em]">© {new Date().getFullYear()} {APP_CONFIG.app.name}{APP_CONFIG.app.nameHighlight} • USA Units Enabled</p>
      </footer>
    </div>
  );
};

export default App;
