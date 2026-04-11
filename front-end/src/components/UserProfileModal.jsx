import React, { useEffect, useRef } from 'react';
import { SKILL_COLOR, instrumentLabel } from '../pages/Profile';

const UserProfileModal = ({ participant, onClose }) => {
  const backdropRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) onClose();
  };

  if (!participant) return null;

  const { userName, userId, bio, recordingLink, avatarUrl, instruments = [], instrumentObjects = [] } = participant;
  const initials = userName?.charAt(0).toUpperCase() || '?';

  return (
    <div ref={backdropRef} onClick={handleBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700">&times;</button>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img src={avatarUrl} alt={userName} className="w-16 h-16 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-700 flex items-center justify-center text-white text-2xl font-bold shrink-0">{initials}</div>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-white leading-tight">{userName}</h2>
              <p className="text-xs text-gray-500 font-mono mt-0.5 break-all">{userId}</p>
            </div>
          </div>
          {bio && (<div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Bio</p><p className="text-sm text-gray-300 leading-relaxed">{bio}</p></div>)}
          {recordingLink && (<div><p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Recording</p><a href={recordingLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 underline break-all">{recordingLink}</a></div>)}
          {(instrumentObjects.length > 0 || instruments.length > 0) && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Instruments</p>
              <div className="flex flex-wrap gap-2">
                {instrumentObjects.length > 0
                  ? instrumentObjects.map((inst, i) => {
                      const label = instrumentLabel(inst);
                      const skill = typeof inst === 'object' ? inst.skill : null;
                      return (<span key={i} className="flex items-center gap-1.5 bg-blue-900 text-blue-200 text-sm font-medium pl-3 pr-2 py-1 rounded-full"><span>{label}</span>{skill && (<span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${SKILL_COLOR[skill] || 'bg-gray-600 text-gray-200'}`}>{skill}</span>)}</span>);
                    })
                  : instruments.map((inst, i) => (<span key={i} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded-full border border-gray-600">{inst}</span>))
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
