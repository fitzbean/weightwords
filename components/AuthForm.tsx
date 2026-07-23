import React, { useState } from 'react';
import { signIn, signUp, resetPassword } from '../services/supabaseService';

interface AuthFormProps {
  view: 'signin' | 'signup';
  onViewChange: (view: 'signin' | 'signup') => void;
  onAuthSuccess: (user: any) => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ view, onViewChange, onAuthSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await resetPassword(email);
      if (error) {
        setError(error.message);
      } else {
        setResetEmailSent(true);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      console.log('Attempting to', view, 'with email:', email);
      const { data, error } = view === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password);

      console.log('Auth response:', { data, error });

      if (error) {
        console.error('Auth error details:', error);
        setError(error.message);
      } else if (view === 'signup') {
        // Show confirmation message for signup
        setConfirmEmail(email);
        setShowConfirmation(true);
      } else if (data.user) {
        // Only auto-login for signin
        onAuthSuccess(data.user);
      }
    } catch (err) {
      console.error('Unexpected auth error:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-card border border-line rounded-3xl shadow-card p-8">
        {resetEmailSent ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-brand-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
            </div>
            <h2 className="font-display text-2xl font-bold text-snow mb-2">Check Your Email</h2>
            <p className="text-fog mb-4">
              We've sent password reset instructions to:
            </p>
            <p className="font-semibold text-snow mb-6">{email}</p>
            <p className="text-sm text-mist mb-6">
              Click the link in the email to reset your password.
            </p>
            <button
              onClick={() => {
                setResetEmailSent(false);
                setForgotPassword(false);
                setEmail('');
                setPassword('');
              }}
              className="w-full h-12 px-6 rounded-2xl bg-brand-500 hover:bg-brand-400 text-emerald-950 font-bold text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none shadow-glow"
            >
              Back to Sign In
            </button>
          </div>
        ) : forgotPassword ? (
          <>
            <h2 className="font-display text-2xl font-bold text-snow mb-6">Reset Password</h2>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 px-6 rounded-2xl bg-brand-500 hover:bg-brand-400 text-emerald-950 font-bold text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none shadow-glow"
              >
                {loading ? 'Sending...' : 'Send Reset Email'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setForgotPassword(false);
                  setError(null);
                }}
                className="text-mist hover:text-brand-400 text-sm font-medium transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          </>
        ) : showConfirmation ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-brand-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
            </div>
            <h2 className="font-display text-2xl font-bold text-snow mb-2">Check Your Email</h2>
            <p className="text-fog mb-4">
              We've sent a confirmation link to:
            </p>
            <p className="font-semibold text-snow mb-6">{confirmEmail}</p>
            <p className="text-sm text-mist mb-6">
              Click the link in the email to verify your account, then come back here to sign in.
            </p>
            <button
              onClick={() => {
                setShowConfirmation(false);
                setEmail('');
                setPassword('');
                onViewChange('signin');
              }}
              className="w-full h-12 px-6 rounded-2xl bg-brand-500 hover:bg-brand-400 text-emerald-950 font-bold text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none shadow-glow"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold text-snow mb-6">
              {view === 'signin' ? 'Welcome Back' : 'Create Account'}
            </h2>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-mist uppercase tracking-[0.14em] mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 rounded-2xl bg-canvas/60 border border-line text-snow placeholder-mist focus:border-brand-500/60 focus:ring-4 focus:ring-brand-500/10 outline-none transition"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 px-6 rounded-2xl bg-brand-500 hover:bg-brand-400 text-emerald-950 font-bold text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none shadow-glow"
          >
            {loading ? 'Loading...' : (view === 'signin' ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <button
            onClick={() => onViewChange(view === 'signin' ? 'signup' : 'signin')}
            className="text-mist hover:text-brand-400 text-sm font-medium transition-colors"
          >
            {view === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'
            }
          </button>
          {view === 'signin' && (
            <div>
              <button
                onClick={() => setForgotPassword(true)}
                className="text-mist hover:text-brand-400 text-sm font-medium transition-colors"
              >
                Forgot your password?
              </button>
            </div>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthForm;
