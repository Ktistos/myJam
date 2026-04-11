import React from 'react';

const Header = ({ userId, userName, avatarUrl, onNavProfile, onNavHome, onLogout }) => {
  const initials = userName?.charAt(0).toUpperCase() || '?';

  return (
    <header className="sticky top-0 z-40 w-full bg-gray-900 shadow-lg p-4 flex flex-col sm:flex-row justify-between items-center">
      <h1
        className="text-2xl font-bold text-white cursor-pointer"
        onClick={onNavHome}
      >
        myJam 🎸
      </h1>

      <button
        onClick={onNavProfile}
        className="flex items-center gap-3 mt-2 sm:mt-0 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-full transition"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="avatar" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {initials}
          </div>
        )}
        <span className="text-sm text-gray-200 font-medium">{userName}</span>
      </button>
      {onLogout && (
        <button
          onClick={onLogout}
          className="mt-2 sm:mt-0 text-xs text-gray-500 hover:text-red-400 transition px-2 py-1 rounded"
        >
          Sign out
        </button>
      )}
    </header>
  );
};

export default Header;
