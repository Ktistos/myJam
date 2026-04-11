import React, { useState } from 'react';

const CreateJamForm = ({ onCreateJam, onCancel }) => {
  const [name,       setName]       = useState('');
  const [date,       setDate]       = useState('');
  const [location,   setLocation]   = useState('');
  const [visibility, setVisibility] = useState('public');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !date) return;
    onCreateJam(name, date, { address: location, lat: null, lng: null }, visibility);
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Create a New Jam</h2>
      <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-xl space-y-4">

        <div>
          <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="jam-name">
            Jam Name
          </label>
          <input
            id="jam-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., 'Weekend Blues Jam'"
          />
        </div>

        <div>
          <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="jam-date">
            Date and Time
          </label>
          <input
            id="jam-date"
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="jam-location">
            Location
          </label>
          <input
            id="jam-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., 'My Garage, 123 Main St'"
          />
        </div>

        <div>
          <label className="block text-gray-400 text-sm font-bold mb-2">Visibility</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="public"
                checked={visibility === 'public'}
                onChange={() => setVisibility('public')}
                className="accent-blue-500"
              />
              <span className="text-white text-sm">Public</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="private"
                checked={visibility === 'private'}
                onChange={() => setVisibility('private')}
                className="accent-blue-500"
              />
              <span className="text-white text-sm">Private (invite only)</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition"
          >
            Create Jam
          </button>
        </div>

      </form>
    </div>
  );
};

export default CreateJamForm;
