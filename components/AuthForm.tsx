import React, { useState } from 'react';
import { signIn, signUp } from '../services/supabaseService';

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
      <div className="bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-700">
        {showConfirmation ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-100 mb-2">Check Your Email</h2>
            <p className="text-gray-400 mb-4">
              We've sent a confirmation link to:
            </p>
            <p className="font-semibold text-gray-100 mb-6">{confirmEmail}</p>
            <p className="text-sm text-gray-400 mb-6">
              Click the link in the email to verify your account, then come back here to sign in.
            </p>
            <button
              onClick={() => {
                setShowConfirmation(false);
                setEmail('');
                setPassword('');
                onViewChange('signin');
              }}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-gray-100 mb-6">
              {view === 'signin' ? 'Welcome Back' : 'Create Account'}
            </h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Loading...' : (view === 'signin' ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => onViewChange(view === 'signin' ? 'signup' : 'signin')}
            className="text-sm text-gray-400 hover:text-gray-200"
          >
            {view === 'signin' 
              ? "Don't have an account? Sign up" 
              : 'Already have an account? Sign in'
            }
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthForm;
