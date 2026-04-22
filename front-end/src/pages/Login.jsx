import React, { useState } from 'react';
import { signInWithGoogle, signInWithFacebook } from '../services/firebase';

const getCurrentHost = () =>
  typeof window !== 'undefined' ? window.location.hostname : 'this host';

function formatAuthError(providerLabel, error) {
  const code = error?.code ?? '';

  if (code === 'auth/unauthorized-domain') {
    return `${providerLabel} sign-in is blocked for ${getCurrentHost()}. Add this hostname to Firebase Authentication > Settings > Authorized domains and try again.`;
  }

  if (code === 'auth/operation-not-allowed') {
    return `${providerLabel} sign-in is not enabled in Firebase Authentication for this project.`;
  }

  if (code === 'auth/popup-blocked') {
    return `${providerLabel} sign-in popup was blocked by the browser. Allow popups and try again.`;
  }

  if (code === 'auth/popup-closed-by-user') {
    return `${providerLabel} sign-in was cancelled before completion.`;
  }

  if (code === 'auth/account-exists-with-different-credential') {
    return `${providerLabel} sign-in uses an email that already exists with another sign-in method. Sign in with the existing provider for that email.`;
  }

  if (
    providerLabel === 'Facebook' &&
    ['auth/invalid-credential', 'auth/invalid-oauth-client-id', 'auth/internal-error'].includes(code)
  ) {
    return 'Facebook sign-in reached Firebase, but Meta rejected the OAuth setup. In Meta Developers, add the Firebase OAuth redirect URI to Facebook Login > Settings > Valid OAuth Redirect URIs.';
  }

  const detail = error?.message?.trim();
  if (detail) {
    return `${providerLabel} sign-in failed: ${detail}`;
  }

  return `${providerLabel} sign-in failed. Please try again.`;
}

const Login = ({ onGuest }) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(null); // 'google' | 'facebook' | null

  const handleGoogle = async () => {
    setError('');
    setLoading('google');
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(formatAuthError('Google', e));
    } finally {
      setLoading(null);
    }
  };

  const handleFacebook = async () => {
    setError('');
    setLoading('facebook');
    try {
      await signInWithFacebook();
    } catch (e) {
      setError(formatAuthError('Facebook', e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-950">
      {/* Logo / hero */}
      <div className="text-center mb-10">
        <div className="text-6xl mb-4">🎸</div>
        <h1 className="text-4xl font-black text-white tracking-tight mb-2">myJam</h1>
        <p className="text-gray-400 text-lg max-w-sm mx-auto">
          Find musicians near you, build setlists, and claim your role.
        </p>
      </div>

      {/* Auth card */}
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-6 text-center">Sign in to join jams</h2>

        <div className="space-y-3">
          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-semibold py-3 px-5 rounded-xl transition-all shadow hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading === 'google' ? (
              <span className="w-5 h-5 border-2 border-gray-400 border-t-gray-800 rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </button>

          {/* Facebook */}
          <button
            onClick={handleFacebook}
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-3 bg-[#1877F2] hover:bg-[#166FE5] text-white font-semibold py-3 px-5 rounded-xl transition-all shadow hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading === 'facebook' ? (
              <span className="w-5 h-5 border-2 border-blue-300 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            )}
            Continue with Facebook
          </button>
        </div>

        {error && (
          <p className="mt-4 text-red-400 text-sm text-center">{error}</p>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-gray-500 text-xs">or</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>

        {/* Guest */}
        <button
          onClick={onGuest}
          className="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 py-3 px-5 rounded-xl transition-all text-sm font-medium"
        >
          <span>📍</span>
          Browse public jams near me
        </button>
        <p className="text-gray-600 text-xs text-center mt-2">
          No account needed — read only
        </p>
      </div>
    </div>
  );
};

export default Login;
