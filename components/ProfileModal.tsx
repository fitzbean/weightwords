import React, { useState } from 'react';
import { UserProfile, Gender, ActivityLevel, WeightGoal } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: UserProfile) => Promise<void>;
  initialData?: UserProfile | null;
  isNewUser?: boolean;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData, 
  isNewUser = false 
}) => {
  const [formData, setFormData] = useState({
    age: initialData?.age || 25,
    gender: initialData?.gender || Gender.MALE,
    weightLbs: initialData?.weightLbs || 150,
    heightFt: initialData?.heightFt || 5,
    heightIn: initialData?.heightIn || 10,
    activityLevel: initialData?.activityLevel || ActivityLevel.MODERATE,
    weightGoal: initialData?.weightGoal || WeightGoal.MAINTAIN,
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await onSave({
        ...formData,
        dailyCalorieTarget: calculateDailyCalories(formData),
        spouseId: initialData?.spouseId,
        profileCompleted: true,
      });
      onClose();
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const calculateDailyCalories = (data: typeof formData): number => {
    // Mifflin-St Jeor Equation
    const { age, gender, weightLbs, heightFt, heightIn, activityLevel, weightGoal } = data;
    
    // Convert to metric
    const weightKg = weightLbs * 0.453592;
    const heightCm = (heightFt * 12 + heightIn) * 2.54;
    
    // BMR calculation
    let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
    if (gender === Gender.FEMALE) {
      bmr -= 161;
    }
    
    // Apply activity level
    const tdee = bmr * parseFloat(activityLevel);
    
    // Apply weight goal
    return Math.round(tdee + parseFloat(weightGoal));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 pb-4">
          <h2 className="text-2xl font-black text-gray-100">
            {isNewUser ? 'Complete Your Profile' : 'Edit Profile'}
          </h2>
          {!isNewUser && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
            >
              ×
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 pb-6">
          {isNewUser && (
            <p className="text-gray-400 mb-6">
              Welcome! Let's set up your profile to calculate your daily calorie targets.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Age */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Age
              </label>
              <input
                type="number"
                min="18"
                max="100"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) })}
                className="w-full p-3 bg-gray-700 text-gray-100 rounded-xl border border-gray-600 focus:border-green-500 outline-none"
                required
              />
            </div>

            {/* Gender */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Gender
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                className="w-full p-3 bg-gray-700 text-gray-100 rounded-xl border border-gray-600 focus:border-green-500 outline-none"
              >
                <option value={Gender.MALE}>Male</option>
                <option value={Gender.FEMALE}>Female</option>
              </select>
            </div>

            {/* Weight */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Weight (lbs)
              </label>
              <input
                type="number"
                min="50"
                max="500"
                value={formData.weightLbs}
                onChange={(e) => setFormData({ ...formData, weightLbs: parseInt(e.target.value) })}
                className="w-full p-3 bg-gray-700 text-gray-100 rounded-xl border border-gray-600 focus:border-green-500 outline-none"
                required
              />
            </div>

            {/* Height */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Height
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="3"
                  max="8"
                  value={formData.heightFt}
                  onChange={(e) => setFormData({ ...formData, heightFt: parseInt(e.target.value) })}
                  className="flex-1 p-3 bg-gray-700 text-gray-100 rounded-xl border border-gray-600 focus:border-green-500 outline-none"
                  placeholder="ft"
                  required
                />
                <input
                  type="number"
                  min="0"
                  max="11"
                  value={formData.heightIn}
                  onChange={(e) => setFormData({ ...formData, heightIn: parseInt(e.target.value) })}
                  className="flex-1 p-3 bg-gray-700 text-gray-100 rounded-xl border border-gray-600 focus:border-green-500 outline-none"
                  placeholder="in"
                  required
                />
              </div>
            </div>

            {/* Activity Level */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Activity Level
              </label>
              <select
                value={formData.activityLevel}
                onChange={(e) => setFormData({ ...formData, activityLevel: e.target.value as ActivityLevel })}
                className="w-full p-3 bg-gray-700 text-gray-100 rounded-xl border border-gray-600 focus:border-green-500 outline-none"
              >
                <option value={ActivityLevel.SEDENTARY}>Sedentary (little or no exercise)</option>
                <option value={ActivityLevel.LIGHT}>Light (1-3 days/week)</option>
                <option value={ActivityLevel.MODERATE}>Moderate (3-5 days/week)</option>
                <option value={ActivityLevel.ACTIVE}>Active (6-7 days/week)</option>
                <option value={ActivityLevel.VERY_ACTIVE}>Very Active (twice/day)</option>
              </select>
            </div>

            {/* Weight Goal */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Weight Goal
              </label>
              <select
                value={formData.weightGoal}
                onChange={(e) => setFormData({ ...formData, weightGoal: e.target.value as WeightGoal })}
                className="w-full p-3 bg-gray-700 text-gray-100 rounded-xl border border-gray-600 focus:border-green-500 outline-none"
              >
                <option value={WeightGoal.LOSE_FAST}>Lose 2 lbs per week</option>
                <option value={WeightGoal.LOSE}>Lose 1 lb per week</option>
                <option value={WeightGoal.MAINTAIN}>Maintain weight</option>
                <option value={WeightGoal.GAIN}>Gain 0.5 lb per week</option>
                <option value={WeightGoal.GAIN_FAST}>Gain 1 lb per week</option>
              </select>
            </div>
          </div>

          {/* Daily Calorie Target */}
          <div className="mt-6 p-4 bg-gray-700 rounded-xl">
            <p className="text-sm text-gray-400">
              Calculated Daily Calorie Target: 
              <span className="text-green-400 font-bold ml-2">
                {calculateDailyCalories(formData)} kcal
              </span>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-6">
            {!isNewUser && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl font-bold hover:bg-gray-600"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-3 bg-green-600 text-white rounded-xl font-black uppercase tracking-widest text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : (isNewUser ? 'Get Started' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileModal;
