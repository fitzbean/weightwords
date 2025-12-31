import React, { useState, useEffect } from 'react';
import { getAllUsers } from '../services/supabaseService';
import { UserProfile } from '../types';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImpersonate: (userId: string, profile: UserProfile, email: string) => void;
}

interface UserItem {
  id: string;
  email: string;
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

  const handleImpersonate = async (userId: string, profile: UserProfile, email: string) => {
    if (!profile) return;
    
    setIsLoadingUser(userId);
    try {
      onImpersonate(userId, profile, email);
      onClose();
    } finally {
      setIsLoadingUser(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-700">
          <h2 className="text-2xl font-black text-gray-100">Admin Panel</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          {/* Search */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Search users by email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-3 bg-gray-700 text-gray-100 rounded-xl border border-gray-600 focus:border-green-500 outline-none"
            />
          </div>

          {/* User List */}
          <div className="overflow-y-auto max-h-[500px]">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map(user => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 bg-gray-700/50 rounded-xl hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="text-gray-100 font-medium">{user.email}</p>
                      {user.profile && (
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xs text-gray-400">
                            {user.profile.age}y, {user.profile.gender === 'male' ? 'M' : 'F'}, {user.profile.weightLbs}lbs
                          </span>
                          {user.profile.isAdmin && (
                            <span className="text-xs bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded-full">
                              ADMIN
                            </span>
                          )}
                          {user.profile.spouseId && (
                            <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded-full">
                              Has Spouse
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {user.profile && (
                      <button
                        onClick={() => handleImpersonate(user.id, user.profile!, user.email)}
                        disabled={isLoadingUser === user.id}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
    </div>
  );
};

export default AdminModal;
