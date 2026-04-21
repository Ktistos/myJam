import React, { useState } from 'react';
import { getUserLocation } from '../utils/geo';

const decodeMapInput = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const toValidCoordinates = (latRaw, lngRaw) => {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
};

export const parseMapPin = (value) => {
  const input = decodeMapInput(value.trim());
  if (!input) return { coords: null, error: '' };

  const googleDataMatch = input.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const googleAtMatch = input.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:,[^/\s?]+)?/);
  const plainPairMatch = input.match(/(?:^|[^\d.-])(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)(?![\d.])/);

  const candidates = [googleDataMatch, googleAtMatch, plainPairMatch].filter(Boolean);
  for (const match of candidates) {
    const coords = toValidCoordinates(match[1], match[2]);
    if (coords) return { coords, error: '' };
  }

  try {
    const url = new URL(input);
    for (const key of ['q', 'query', 'll']) {
      const valueFromParam = url.searchParams.get(key);
      if (!valueFromParam) continue;
      const paramMatch = valueFromParam.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (!paramMatch) continue;
      const coords = toValidCoordinates(paramMatch[1], paramMatch[2]);
      if (coords) return { coords, error: '' };
    }
  } catch {
    // Non-URL input is handled by the plain coordinate parser above.
  }

  return {
    coords: null,
    error: 'Could not read coordinates. Paste a full Google Maps URL with coordinates, or paste "lat, lng".',
  };
};

const formatCoords = ({ lat, lng }) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
const shouldRenderMapPreview = import.meta.env.MODE !== 'test';

const CreateJamForm = ({ onCreateJam, onCancel }) => {
  const [name,       setName]       = useState('');
  const [date,       setDate]       = useState('');
  const [location,   setLocation]   = useState('');
  const [visibility, setVisibility] = useState('public');
  const [mapPinInput, setMapPinInput] = useState('');
  const [mapPinCoords, setMapPinCoords] = useState(null);
  const [mapPinError, setMapPinError] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !date) return;
    onCreateJam(
      name,
      date,
      {
        address: location.trim(),
        lat: mapPinCoords?.lat ?? null,
        lng: mapPinCoords?.lng ?? null,
      },
      visibility
    );
  };

  const handleMapPinChange = (value) => {
    setMapPinInput(value);
    const result = parseMapPin(value);
    setMapPinCoords(result.coords);
    setMapPinError(result.error);
  };

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    setMapPinError('');

    try {
      const coords = await getUserLocation();
      setMapPinCoords(coords);
      setMapPinInput(formatCoords(coords));
    } catch (err) {
      setMapPinError(err?.message || 'Could not read your current location.');
    } finally {
      setIsLocating(false);
    }
  };

  const clearMapPin = () => {
    setMapPinInput('');
    setMapPinCoords(null);
    setMapPinError('');
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
            Location address / venue
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

        <div className="space-y-2">
          <label className="block text-gray-400 text-sm font-bold" htmlFor="jam-map-pin">
            Google Maps pin
          </label>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              id="jam-map-pin"
              type="text"
              value={mapPinInput}
              onChange={(e) => handleMapPinChange(e.target.value)}
              className={`w-full bg-gray-700 text-white p-2 rounded-md border focus:outline-none focus:ring-2 ${
                mapPinError
                  ? 'border-red-600 focus:ring-red-500'
                  : 'border-gray-600 focus:ring-blue-500'
              }`}
              placeholder="Paste Google Maps URL or coordinates: 37.983810, 23.727539"
            />
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocating}
              className="bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm font-bold py-2 px-3 rounded-lg border border-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLocating ? 'Locating...' : 'Use My Location'}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            This stores exact coordinates for radius search. Short Google Maps share links may not include coordinates; paste the full URL or a lat/lng pair.
          </p>

          {mapPinError && (
            <p className="text-xs text-red-400" role="alert">{mapPinError}</p>
          )}

          {mapPinCoords && (
            <div className="rounded-xl overflow-hidden border border-gray-700 bg-gray-900">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-gray-700">
                <p className="text-xs text-green-400 font-semibold">
                  Pin set: {formatCoords(mapPinCoords)}
                </p>
                <button
                  type="button"
                  onClick={clearMapPin}
                  className="text-xs text-gray-400 hover:text-white transition"
                >
                  Clear pin
                </button>
              </div>
              {shouldRenderMapPreview ? (
                <iframe
                  title="Selected jam map pin"
                  src={`https://www.google.com/maps?q=${mapPinCoords.lat},${mapPinCoords.lng}&z=15&output=embed`}
                  className="w-full h-48 border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
                  Map preview
                </div>
              )}
            </div>
          )}
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
