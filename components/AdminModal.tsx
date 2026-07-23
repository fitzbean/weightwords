import React, { useState, useEffect } from 'react';
import { getAllUsers } from '../services/supabaseService';
import { UserProfile } from '../types';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImpersonate: (userId: string, profile: UserProfile) => void;
}

interface UserItem {
  id: string;
  email: string;
  lastFoodDate: string | null;
  profile: UserProfile | null;
}

const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose, onImpersonate }) => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingUser, setIsLoadingUser] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const userList = await getAllUsers();
      setUsers(userList.sort((a, b) => a.email.localeCompare(b.email)));
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.profile?.spouseId && user.email.includes(searchTerm))
  );

  const handleImpersonate = async (userId: string, profile: UserProfile) => {
    if (!profile) return;

    setIsLoadingUser(userId);
    try {
      onImpersonate(userId, profile);
      onClose();
    } finally {
      setIsLoadingUser(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-card border border-line rounded-t-3xl sm:rounded-3xl shadow-pop w-full max-w-2xl max-h-[90dvh] overflow-y-auto p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 flex flex-col">
        {/* mobile grab handle */}
        <div className="w-10 h-1 rounded-full bg-line2 mx-auto mb-4 sm:hidden" />

        <div className="flex justify-between items-center mb-4">
          <h2 className="font-display text-lg font-bold text-snow">Admin Panel</h2>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-mist hover:text-snow hover:bg-card2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search users by email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
          />
        </div>

        {/* User List */}
        <div className="overflow-y-auto max-h-[500px]">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-400"></div>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredUsers.map(user => (
                <div
                  key={user.id}
                  className="min-h-[44px] p-4 rounded-xl hover:bg-card2 transition-colors"
                >
                  <div className="flex-1">
                    <p className="text-snow font-medium">{user.email}</p>
                    {user.lastFoodDate && (
                      <p className="text-xs text-mist mt-0.5">
                        Last food entry: {new Date(user.lastFoodDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                    {user.profile && (
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs text-fog">
                          {user.profile.age}y, {user.profile.gender === 'male' ? 'M' : 'F'}, {user.profile.weightLbs}lbs
                        </span>
                        {user.profile.isAdmin && (
                          <span className="text-xs bg-violet-400/10 text-violet-400 px-2 py-0.5 rounded-full">
                            ADMIN
                          </span>
                        )}
                        {user.profile.spouseId && (
                          <span className="text-xs bg-sky-400/10 text-sky-400 px-2 py-0.5 rounded-full">
                            Has Spouse
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {user.profile && (
                    <button
                      onClick={() => handleImpersonate(user.id, user.profile!)}
                      disabled={isLoadingUser === user.id}
                      className="mt-3 h-11 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {isLoadingUser === user.id ? 'Loading...' : 'View As User'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminModal;
