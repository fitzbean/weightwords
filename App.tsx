
import React, { useState, useEffect } from 'react';
import { UserProfile } from './types';
import ProfileForm from './components/ProfileForm';
import Dashboard from './components/Dashboard';

const App: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedProfile = localStorage.getItem('weightwords_profile');
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        if (parsed && typeof parsed === 'object' && 'dailyCalorieTarget' in parsed) {
          setProfile(parsed);
        } else {
           localStorage.removeItem('weightwords_profile');
        }
      } catch (e) {
        console.error("Failed to parse saved profile", e);
        localStorage.removeItem('weightwords_profile');
      }
    }
    setIsLoading(false);
  }, []);

  const handleSaveProfile = (newProfile: UserProfile) => {
    setProfile(newProfile);
    localStorage.setItem('weightwords_profile', JSON.stringify(newProfile));
  };

  const handleLogout = () => {
    const shouldReset = window.confirm("Are you sure you want to reset your profile and goals? Today's food log will remain until tomorrow.");
    if (shouldReset) {
        localStorage.removeItem('weightwords_profile');
        setProfile(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <nav className="bg-white border-b border-gray-100 py-4 px-6 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-green-600 text-white p-1.5 rounded-lg shadow-md shadow-green-100">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"></path></svg>
            </div>
            <span className="text-xl font-black text-gray-900 tracking-tight">WEIGHT<span className="text-green-600">WORDS</span> <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded ml-1 font-bold uppercase">AI</span></span>
          </div>
          
          {profile && (
            <div className="hidden sm:flex items-center gap-6">
               <div className="text-right">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Tracking Status</p>
                  <p className="text-sm font-bold text-gray-700">Active Session</p>
               </div>
               <div className="h-8 w-px bg-gray-100"></div>
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 border border-green-200 flex items-center justify-center text-green-700">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path></svg>
                  </div>
               </div>
            </div>
          )}
        </div>
      </nav>

      <main className="py-8 px-4" key={profile ? 'dashboard' : 'profile-form'}>
        {!profile ? (
          <div className="animate-in fade-in duration-500 translate-y-0">
            <div className="text-center mb-12 max-w-2xl mx-auto">
                <h1 className="text-4xl md:text-6xl font-black text-gray-900 mb-6 leading-tight tracking-tight">Smart Nutrition <br/><span className="text-green-600">Built for You</span>.</h1>
                <p className="text-lg text-gray-500 font-medium">Calculate your physical needs instantly and log meals by describing them naturally.</p>
            </div>
            <ProfileForm onSave={handleSaveProfile} />
          </div>
        ) : (
          <Dashboard profile={profile} onLogout={handleLogout} />
        )}
      </main>

      <footer className="mt-20 border-t border-gray-100 py-12 text-center">
         <p className="text-gray-300 text-xs font-bold uppercase tracking-widest">© {new Date().getFullYear()} WeightWords • USA Units Enabled</p>
      </footer>
    </div>
  );
};

export default App;
