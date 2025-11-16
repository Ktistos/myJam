import React from 'react';

/**
 * Main application header.
 * Displays user ID and navigation.
 */
const Header = ({ userId, userName, onNavProfile, onNavHome }) => (
  <header className="sticky top-0 z-40 w-full bg-gray-900 shadow-lg p-4 flex flex-col sm:flex-row justify-between items-center">
    <h1 
      className="text-2xl font-bold text-white cursor-pointer"
      onClick={onNavHome}
    >
      myJam 🎸
    </h1>
    <div className="flex items-center space-x-4 mt-2 sm:mt-0">
      <div className="text-sm text-gray-400">
        <span className="font-semibold text-gray-300">User:</span> {userName}
      </div>
      <button
        onClick={onNavProfile}
        className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold py-1 px-3 rounded-full transition"
      >
        Profile
      </button>
    </div>
  </header>
);

export default Header;