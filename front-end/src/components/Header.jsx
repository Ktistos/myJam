import React, { useEffect, useState } from 'react';

const Header = ({ userId, userName, avatarUrl, onNavProfile, onNavHome, onLogout, isGuest }) => {
  const initials = userName?.charAt(0).toUpperCase() || '?';
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

  const showAvatarImage = Boolean(avatarUrl) && !avatarFailed;

  return (
    <header className="sticky top-0 z-40 w-full bg-gray-900 shadow-lg p-4 flex flex-col sm:flex-row justify-between items-center">
      <h1
        className="text-2xl font-bold text-white cursor-pointer"
        onClick={onNavHome}
      >
        myJam 🎸
      </h1>

      <div className="flex items-center gap-2 mt-2 sm:mt-0">
        {isGuest ? (
          <button
            onClick={onNavProfile}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-1.5 px-4 rounded-lg transition"
          >
            Sign in
          </button>
        ) : (
          <button
            onClick={onNavProfile}
            className="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-full transition"
          >
            {showAvatarImage ? (
              <img
                src={avatarUrl}
                alt="avatar"
                onError={() => setAvatarFailed(true)}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {initials}
              </div>
            )}
            <span className="text-sm text-gray-200 font-medium">{userName}</span>
          </button>
        )}

        {onLogout && (
          <button
            onClick={onLogout}
            className="text-xs text-gray-500 hover:text-red-400 transition px-2 py-1 rounded"
          >
            {isGuest ? 'Exit' : 'Sign out'}
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
