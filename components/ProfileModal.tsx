import React, { useState, useEffect } from 'react';
import { UserProfile, Gender, ActivityLevel, WeightGoal } from '../types';
import { LIVE_VOICES, DEFAULT_LIVE_VOICE } from '../services/geminiLiveService';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: UserProfile) => Promise<void>;
  initialData?: UserProfile | null;
  isNewUser?: boolean;
  liveVoice?: string;
  onLiveVoiceChange?: (voice: string) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  isNewUser = false,
  liveVoice = DEFAULT_LIVE_VOICE,
  onLiveVoiceChange
}) => {
  const [voice, setVoice] = useState<string>(liveVoice);

  useEffect(() => {
    setVoice(liveVoice);
  }, [liveVoice]);
  const [formData, setFormData] = useState({
    displayName: initialData?.displayName || '',
    age: initialData?.age || 25,
    gender: initialData?.gender || Gender.MALE,
    weightLbs: initialData?.weightLbs || 150,
    heightFt: initialData?.heightFt || 5,
    heightIn: initialData?.heightIn || 10,
    activityLevel: initialData?.activityLevel || ActivityLevel.MODERATE,
    weightGoal: initialData?.weightGoal || WeightGoal.MAINTAIN,
    timezone: initialData?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    targetWeightLbs: initialData?.targetWeightLbs || undefined,
    weighDay: initialData?.weighDay ?? 1, // Default to Monday
  });

  // Update form data when initialData changes (e.g., when profile loads from database)
  useEffect(() => {
    if (initialData) {
      setFormData({
        displayName: initialData.displayName || '',
        age: initialData.age || 25,
        gender: initialData.gender || Gender.MALE,
        weightLbs: initialData.weightLbs || 150,
        heightFt: initialData.heightFt || 5,
        heightIn: initialData.heightIn || 10,
        activityLevel: initialData.activityLevel || ActivityLevel.MODERATE,
        weightGoal: initialData.weightGoal || WeightGoal.MAINTAIN,
        timezone: initialData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        targetWeightLbs: initialData.targetWeightLbs || undefined,
        weighDay: initialData.weighDay ?? 1,
      });
    }
  }, [initialData]);

  // Days of the week for weigh day selector
  const weekDays = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
  ];

  // Common US timezones
  const timezones = [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
    { value: 'UTC', label: 'UTC' },
  ];

  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    // Persist the AI voice preference (stored per-user in localStorage, not the DB).
    onLiveVoiceChange?.(voice);

    try {
      await onSave({
        ...formData,
        displayName: formData.displayName || undefined,
        targetWeightLbs: formData.targetWeightLbs || undefined,
        dailyCalorieTarget: calculateDailyCalories(formData),
        spouseId: initialData?.spouseId,
        profileCompleted: true,
        weighDay: formData.weighDay,
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

  const calculateIdealWeight = (data: typeof formData): number | null => {
    const { gender, heightFt, heightIn } = data;
    const totalHeightInches = heightFt * 12 + heightIn;
    
    // Miller's Formula (1983)
    // Men: IBW = 56.2 kg + 1.41 kg for each inch over 5 feet
    // Women: IBW = 53.1 kg + 1.36 kg for each inch over 5 feet
    // 1 kg = 2.20462 lbs
    
    if (totalHeightInches < 60) return null; // Formula is for 5ft+

    const inchesOver5ft = totalHeightInches - 60;
    let baseKg = gender === Gender.MALE ? 56.2 : 53.1;
    let kgPerInch = gender === Gender.MALE ? 1.41 : 1.36;
    const idealKg = baseKg + (kgPerInch * inchesOver5ft);
    return Math.round(idealKg * 2.20462);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 ww-backdrop-in">
      <div className="bg-card border border-line rounded-t-3xl sm:rounded-3xl shadow-pop w-full max-w-2xl max-h-[90dvh] flex flex-col p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* mobile grab handle */}
        <div className="w-10 h-1 rounded-full bg-line2 mx-auto mb-4 sm:hidden" />
        <div className="flex justify-between items-center pb-4">
          <h2 className="font-display text-xl font-bold text-snow">
            {isNewUser ? 'Complete Your Profile' : 'Edit Profile'}
          </h2>
          {!isNewUser && (
            <button
              onClick={onClose}
              className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl text-mist hover:text-snow hover:bg-card2 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto -mx-1 px-1">
          {isNewUser && (
            <p className="text-fog text-sm mb-6">
              Welcome! Let's set up your profile to calculate your daily calorie targets.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Display Name */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
                placeholder="First Name"
              />
            </div>

            {/* Age */}
            <div>
              <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
                Age
              </label>
              <input
                type="number"
                min="18"
                max="100"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) })}
                className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
                required
              />
            </div>

            {/* Gender */}
            <div>
              <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
                Gender
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
              >
                <option value={Gender.MALE}>Male</option>
                <option value={Gender.FEMALE}>Female</option>
              </select>
            </div>

            {/* Weight */}
            <div>
              <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
                Weight (lbs)
              </label>
              <input
                type="number"
                min="50"
                max="500"
                value={formData.weightLbs}
                onChange={(e) => setFormData({ ...formData, weightLbs: parseInt(e.target.value) })}
                className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
                required
              />
            </div>

            {/* Height */}
            <div>
              <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
                Height
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="3"
                  max="8"
                  value={formData.heightFt}
                  onChange={(e) => setFormData({ ...formData, heightFt: parseInt(e.target.value) })}
                  className="flex-1 min-w-0 h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
                  placeholder="ft"
                  required
                />
                <input
                  type="number"
                  min="0"
                  max="11"
                  value={formData.heightIn}
                  onChange={(e) => setFormData({ ...formData, heightIn: parseInt(e.target.value) })}
                  className="flex-1 min-w-0 h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
                  placeholder="in"
                  required
                />
              </div>
            </div>

            {/* Activity Level */}
            <div>
              <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
                Activity Level
              </label>
              <select
                value={formData.activityLevel}
                onChange={(e) => setFormData({ ...formData, activityLevel: e.target.value as ActivityLevel })}
                className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
              >
                <option value={ActivityLevel.SEDENTARY}>Sedentary</option>
                <option value={ActivityLevel.LIGHT}>Light</option>
                <option value={ActivityLevel.MODERATE}>Moderate</option>
                <option value={ActivityLevel.ACTIVE}>Active</option>
                <option value={ActivityLevel.VERY_ACTIVE}>Very Active</option>
              </select>
              <p className="text-xs text-mist mt-1.5">
                {formData.activityLevel === ActivityLevel.SEDENTARY && (
                  <>Little to no exercise. You work a desk job and don't engage in regular physical activity. Golf with a cart would fall here.</>
                )}
                {formData.activityLevel === ActivityLevel.LIGHT && (
                  <>Light exercise 1-3 days per week. Examples: leisurely walking, gentle/restorative yoga, light stretching, casual cycling, or golf with a walking cart for 20-30 minutes.</>
                )}
                {formData.activityLevel === ActivityLevel.MODERATE && (
                  <>Moderate exercise 3-5 days per week. Examples: brisk walking, jogging, cycling, swimming, power/vinyasa yoga, or golf while carrying clubs for 30-45 minutes per session.</>
                )}
                {formData.activityLevel === ActivityLevel.ACTIVE && (
                  <>Hard exercise 6-7 days per week. Examples: running, intense weight training, competitive sports, hot yoga, or physically demanding work.</>
                )}
                {formData.activityLevel === ActivityLevel.VERY_ACTIVE && (
                  <>Very hard exercise daily or twice per day. Examples: professional athletes, construction workers, or training for endurance events.</>
                )}
              </p>
            </div>

            {/* Weight Goal */}
            <div>
              <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
                Weight Goal
              </label>
              <select
                value={formData.weightGoal}
                onChange={(e) => setFormData({ ...formData, weightGoal: e.target.value as WeightGoal })}
                className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
              >
                <option value={WeightGoal.LOSE_FAST}>Lose 2 lbs per week</option>
                <option value={WeightGoal.LOSE_ONE_HALF}>Lose 1.5 lbs per week</option>
                <option value={WeightGoal.LOSE}>Lose 1 lb per week</option>
                <option value={WeightGoal.LOSE_HALF}>Lose 0.5 lb per week</option>
                <option value={WeightGoal.MAINTAIN}>Maintain weight</option>
                <option value={WeightGoal.GAIN}>Gain 0.5 lb per week</option>
                <option value={WeightGoal.GAIN_FAST}>Gain 1 lb per week</option>
              </select>
            </div>

            {/* Target Weight */}
            <div>
              <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
                Target Weight (lbs)
              </label>
              <input
                type="number"
                min="50"
                max="500"
                value={formData.targetWeightLbs || ''}
                onChange={(e) => setFormData({ ...formData, targetWeightLbs: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
                placeholder="Optional"
              />
              {calculateIdealWeight(formData) && (
                <p className="text-xs text-mist mt-1.5">
                  Ideal Weight (Miller's Formula): <span className="text-sky-400 font-semibold">{calculateIdealWeight(formData)} lbs</span>
                </p>
              )}
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
                Timezone
              </label>
              <select
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
              >
                {timezones.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>

            {/* Weigh Day */}
            <div>
              <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
                Weigh-In Day
              </label>
              <select
                value={formData.weighDay}
                onChange={(e) => setFormData({ ...formData, weighDay: parseInt(e.target.value) })}
                className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
              >
                {weekDays.map(day => (
                  <option key={day.value} value={day.value}>{day.label}</option>
                ))}
              </select>
              <p className="text-xs text-mist mt-1.5">
                Your weekly progress will start on this day
              </p>
            </div>

            {/* AI Voice (Live logging) */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
                AI Voice
              </label>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
              >
                {LIVE_VOICES.map((v) => (
                  <option key={v.name} value={v.name}>{v.name} — {v.vibe}</option>
                ))}
              </select>
              <p className="text-xs text-mist mt-1.5">
                Voice used by the live voice-logging assistant (the broadcast icon).
              </p>
            </div>
          </div>

          {/* Daily Calorie Target */}
          <div className="mt-6 p-4 bg-card2 border border-line2 rounded-2xl">
            <p className="text-sm text-fog">
              Calculated Daily Calorie Target:
              <span className="font-display text-brand-400 font-bold tabular-nums ml-2">
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
                className="flex-1 h-12 px-5 rounded-2xl bg-card2 border border-line2 text-fog font-semibold text-sm hover:text-snow hover:border-line2 transition-all duration-200 active:scale-[0.98]"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 h-12 px-6 rounded-2xl bg-brand-500 hover:bg-brand-400 text-emerald-950 font-bold text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none shadow-glow"
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
