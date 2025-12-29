
import React, { useState } from 'react';
import { UserProfile, Gender, ActivityLevel, WeightGoal } from '../types';
import { ACTIVITY_LEVEL_OPTIONS, GOAL_OPTIONS, calculateTDEE } from '../constants';

interface ProfileFormProps {
  onSave: (profile: UserProfile) => void;
  initialData?: UserProfile | null;
}

const ProfileForm: React.FC<ProfileFormProps> = ({ onSave, initialData }) => {
  // We use string values for the inputs so that they can be empty while typing
  const [formData, setFormData] = useState({
    age: initialData?.age?.toString() || '30',
    gender: initialData?.gender || Gender.MALE,
    weightLbs: initialData?.weightLbs?.toString() || '165',
    heightFt: initialData?.heightFt?.toString() || '5',
    heightIn: initialData?.heightIn?.toString() || '9',
    activityLevel: initialData?.activityLevel || ActivityLevel.SEDENTARY,
    weightGoal: initialData?.weightGoal || WeightGoal.MAINTAIN,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse values only on submission
    const age = parseInt(formData.age, 10) || 0;
    const weightLbs = parseFloat(formData.weightLbs) || 0;
    const heightFt = parseInt(formData.heightFt, 10) || 0;
    const heightIn = parseInt(formData.heightIn, 10) || 0;

    const tdee = calculateTDEE(
      age,
      formData.gender as Gender,
      weightLbs,
      heightFt,
      heightIn,
      formData.activityLevel
    );
    
    const target = tdee + parseInt(formData.weightGoal, 10);
    
    onSave({
      age,
      gender: formData.gender as Gender,
      weightLbs,
      heightFt,
      heightIn,
      activityLevel: formData.activityLevel,
      weightGoal: formData.weightGoal,
      dailyCalorieTarget: target 
    });
  };

  const inputClasses = "w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white text-gray-900 placeholder-gray-300 transition-all";

  const handleChange = (field: string, value: string) => {
    // We allow any string value here, including empty strings, so the user can delete characters
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 space-y-6 max-w-md mx-auto transform transition-all">
      <div>
        <h2 className="text-2xl font-black text-gray-800 mb-1">Your Physical Profile</h2>
        <p className="text-gray-400 text-sm mb-6">Enter your details to calculate your daily target.</p>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Age</label>
          <input
            type="number"
            value={formData.age}
            onChange={(e) => handleChange('age', e.target.value)}
            className={inputClasses}
            placeholder="30"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Gender</label>
          <select
            value={formData.gender}
            onChange={(e) => handleChange('gender', e.target.value)}
            className={inputClasses}
          >
            <option value={Gender.MALE}>Male</option>
            <option value={Gender.FEMALE}>Female</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Weight (lbs)</label>
        <input
          type="number"
          step="0.1"
          value={formData.weightLbs}
          onChange={(e) => handleChange('weightLbs', e.target.value)}
          className={inputClasses}
          placeholder="165"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Height (ft)</label>
          <input
            type="number"
            value={formData.heightFt}
            min="0"
            max="8"
            onChange={(e) => handleChange('heightFt', e.target.value)}
            className={inputClasses}
            placeholder="5"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Height (in)</label>
          <input
            type="number"
            value={formData.heightIn}
            min="0"
            max="11"
            onChange={(e) => handleChange('heightIn', e.target.value)}
            className={inputClasses}
            placeholder="9"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Activity Level</label>
        <select
          value={formData.activityLevel}
          onChange={(e) => handleChange('activityLevel', e.target.value)}
          className={inputClasses}
        >
          {ACTIVITY_LEVEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Weight Goal</label>
        <select
          value={formData.weightGoal}
          onChange={(e) => handleChange('weightGoal', e.target.value)}
          className={inputClasses}
        >
          {GOAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-green-200 active:scale-[0.98]"
      >
        Calculate & Start
      </button>
    </form>
  );
};

export default ProfileForm;
