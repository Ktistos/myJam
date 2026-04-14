import React, { useState } from 'react';
import { INSTRUMENT_TYPES, instrumentLabel } from '../pages/Profile';

const HARDWARE_INSTRUMENT_TYPES = INSTRUMENT_TYPES.filter((type) => type !== 'Vocals');

const JoinJamModal = ({ jam, userInstruments, existingHardware, onConfirm, onCancel }) => {
  const profileLabels = userInstruments
    .map((inst) => instrumentLabel(inst))
    .filter((label) => label && label !== 'Vocals');

  const [selected, setSelected]           = useState([]);
  const [selectedType, setSelectedType]   = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  const toggle = (label) =>
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
    );

  const addInstrument = (e) => {
    e?.preventDefault();
    if (!selectedType) return;
    const label = instrumentLabel({ type: selectedType, model: selectedModel.trim() });
    if (!label || selected.includes(label)) return;
    setSelected((prev) => [...prev, label]);
    setSelectedType('');
    setSelectedModel('');
  };

  const removeSelected = (label) => setSelected((prev) => prev.filter((i) => i !== label));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="p-5 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Join {jam?.name}</h2>
          <p className="text-sm text-gray-400 mt-1">
            What instruments are you bringing to this jam?
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Your selections are added to the jam&apos;s available hardware. Vocals are always available as a role.
          </p>
        </div>

        <div className="p-5 space-y-5">
          {/* Profile instruments */}
          {profileLabels.length > 0 ? (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Your Non-Vocal Instruments
              </p>
              <div className="space-y-2">
                {profileLabels.map((label) => {
                  const checked = selected.includes(label);
                  return (
                    <label
                      key={label}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors border ${
                        checked
                          ? 'bg-blue-900 border-blue-700'
                          : 'bg-gray-700 border-gray-600 hover:bg-gray-650'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(label)}
                        className="w-4 h-4 accent-blue-500"
                      />
                      <span className="text-sm text-gray-200 font-medium">{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">
              No non-vocal instruments in your profile yet.{' '}
              <span className="text-gray-400">Add them below or in your profile settings.</span>
            </p>
          )}

          {/* Instrument picker */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Add Another Instrument
            </p>
            <form onSubmit={addInstrument} className="space-y-2">
              <select
                aria-label="Additional hardware instrument"
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setSelectedModel('');
                }}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Select an instrument…</option>
                {HARDWARE_INSTRUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <input
                type="text"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={!selectedType}
                placeholder={selectedType ? 'Model (optional)' : 'Choose an instrument first'}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!selectedType}
                className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold px-3 py-2 rounded-lg transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add Instrument
              </button>
            </form>
          </div>

          {/* Selected summary */}
          {selected.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                You are bringing
              </p>
              <div className="flex flex-wrap gap-2">
                {selected.map((label) => (
                  <span
                    key={label}
                    className="flex items-center gap-1.5 bg-blue-900 border border-blue-700 text-blue-200 text-sm px-2.5 py-1 rounded-full"
                  >
                    {label}
                    <button
                      onClick={() => removeSelected(label)}
                      className="text-blue-400 hover:text-white font-bold leading-none"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-transparent border border-gray-600 hover:bg-gray-700 text-gray-300 hover:text-white font-bold py-2.5 rounded-lg transition text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selected)}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg transition text-sm shadow"
          >
            {selected.length > 0
              ? `Join & Add ${selected.length} Instrument${selected.length !== 1 ? 's' : ''}`
              : 'Join Without Adding Instruments'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JoinJamModal;
