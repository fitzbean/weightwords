
import React, { useState, useEffect } from 'react';
import { UserProfile } from './types';
import ProfileForm from './components/ProfileForm';
import Dashboard from './components/Dashboard';
import AuthForm from './components/AuthForm';
import { supabase, getCurrentUser, getProfile, updateProfile, signOut, onAuthStateChange } from './services/supabaseService';
import { APP_CONFIG } from './appConfig';

const App: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authView, setAuthView] = useState<'signin' | 'signup'>('signin');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

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
          
          // Batch state updates
          setProfile(profileToSet);
          setUser(currentUser);
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
      if (authUser && authUser.email_confirmed_at) {
        const userProfile = await getProfile(authUser.id);
        
        // If user exists but profile doesn't, there's a stale session - sign out
        if (!userProfile) {
          console.log('Stale session detected in auth change - signing out');
          await signOut();
          setUser(null);
          setProfile(null);
          return;
        }
        
        const profileToSet = (userProfile && userProfile.profileCompleted) ? userProfile : null;
        
        // Batch state updates
        setProfile(profileToSet);
        setUser(authUser);
      } else {
        setUser(null);
        setProfile(null);
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

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
        });
      error = insertError;
    }

    if (!error) {
      setProfile(newProfile);
      setIsEditingProfile(false);
    } else {
      console.error('Error saving profile:', error);
      alert('Failed to save profile. Please try again.');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserMenu && !(event.target as Element).closest('.user-menu')) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const handleLogout = async () => {
    await signOut();
  };

  const handleEditProfile = () => {
    setIsEditingProfile(true);
    setShowUserMenu(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100">
        <nav className="bg-gray-800 border-b border-gray-700 py-4 px-6 sticky top-0 z-50 shadow-sm">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="bg-green-600 text-white p-1.5 rounded-lg shadow-md shadow-green-900">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"></path></svg>
              </div>
              <span className="text-l font-black text-gray-100 tracking-tight">WEIGHT<span className="text-green-500">WORDS</span> <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded ml-1 font-bold uppercase">AI</span></span>
            </div>
          </div>
        </nav>
        
        <div className="py-8 px-4">
          <div className="animate-in fade-in duration-500 translate-y-0">
            <div className="text-center mb-12 max-w-2xl mx-auto">
                <h1 className="text-4xl md:text-6xl font-black text-gray-100 mb-6 leading-tight tracking-tight">
                  {APP_CONFIG.hero.title}<br/>
                  <span className="text-green-500">{APP_CONFIG.hero.titleHighlight}</span>
                </h1>
                <p className="text-lg text-gray-400 font-medium">{APP_CONFIG.hero.description}</p>
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
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <nav className="bg-gray-800 border-b border-gray-700 py-4 px-6 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto flex justify-between items-center flex-wrap sm:flex-nowrap gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-green-600 text-white p-1.5 rounded-lg shadow-md shadow-green-900">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"></path></svg>
            </div>
            <span className="text-l font-black text-gray-100 tracking-tight">WEIGHT<span className="text-green-500">WORDS</span> <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded ml-1 font-bold uppercase">AI</span></span>
          </div>
          
          {profile && (
            <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
               <div className="text-right">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Today</p>
                  <p className="text-sm font-bold text-gray-300 cursor-pointer hover:text-gray-200 transition-colors">
                    {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
               </div>
               <div className="h-8 w-px bg-gray-700"></div>
               <div className="relative user-menu">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="w-8 h-8 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center hover:bg-gray-600 transition-colors"
                  >
                    <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path>
                    </svg>
                  </button>
                  
                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg border border-gray-700 py-2 z-50">
                      <button
                        onClick={handleEditProfile}
                        className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-3"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                        </svg>
                        Edit Profile
                      </button>
                      <hr className="my-1 border-gray-700" />
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-3"
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

      <main className="py-8 px-4" key={profile ? 'dashboard' : 'profile-form'}>
        {!profile || isEditingProfile ? (
          <div className="animate-in fade-in duration-500 translate-y-0">
            <div className="text-center mb-12 max-w-2xl mx-auto">
                <h1 className="text-4xl md:text-6xl font-black text-gray-100 mb-6 leading-tight tracking-tight">
                  {APP_CONFIG.hero.title}<br/>
                  <span className="text-green-500">{APP_CONFIG.hero.titleHighlight}</span>
                </h1>
                <p className="text-lg text-gray-400 font-medium">{APP_CONFIG.hero.description}</p>
            </div>
            <ProfileForm onSave={handleSaveProfile} initialData={profile} />
          </div>
        ) : (
          <Dashboard profile={profile} onLogout={handleLogout} />
        )}
      </main>

      <footer className="mt-20 border-t border-gray-800 py-12 text-center">
         <p className="text-gray-600 text-xs font-bold uppercase tracking-widest">© {new Date().getFullYear()} WeightWords • USA Units Enabled</p>
      </footer>
    </div>
  );
};

export default App;
