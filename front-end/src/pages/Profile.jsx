import React, { useState } from 'react';

/**
 * Displays a form to update the user's public display name.
 */
const Profile = ({ initialUserName, onSave, onBack, userId }) => {
  const [name, setName] = useState(initialUserName);

  const handleSave = () => {
    onSave(name);
  };

  return (
    <div className="p-4">
      <button onClick={onBack} className="text-blue-400 hover:text-blue-300 mb-4">&larr; Back to Jams</button>
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
        <h2 className="text-2xl font-bold mb-4">Your Profile</h2>
        <div className="mb-4">
          <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="userId">
            Your User ID (Share this to be found)
          </label>
          <input
            id="userId"
            type="text"
            readOnly
            value={userId}
            className="w-full bg-gray-700 text-gray-300 p-2 rounded-md cursor-not-allowed"
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="username">
            Display Name
          </label>
          <input
            id="username"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., 'GrooveMaster'"
          />
        </div>
        <button
          onClick={handleSave}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200"
        >
          Save Name
        </button>
      </div>
    </div>
  );
};

export default Profile;