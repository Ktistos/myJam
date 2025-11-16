import React, { useState, useEffect, useCallback, useMemo } from 'react';
// --- Firebase Imports Removed ---

// --- MOCK DATA & LOCAL STATE ---

// A hard-coded user for the demo
const MOCK_USER = {
  uid: 'demo-user-123',
  name: 'Demo Musician'
};

// --- Helper Components ---

/**
 * A simple loading spinner component.
 */
const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-full p-16">
    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
  </div>
);

/**
 * A modal dialog to replace alert() and confirm().
 */
const Modal = ({ title, message, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
    <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
      <h3 className="text-xl font-bold text-white mb-4">{title}</h3>
      <p className="text-gray-300 mb-6">{message}</p>
      <button
        onClick={onClose}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200"
      >
        Close
      </button>
    </div>
  </div>
);

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

// --- Page & Feature Components ---

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

/**
 * Displays the list of available jam sessions.
 */
const JamList = ({ jams, onJamClick, onNavCreate }) => (
  <div className="p-4">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-2xl font-bold">Upcoming Jams</h2>
      <button
        onClick={onNavCreate}
        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition"
      >
        + Create Jam
      </button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {jams.length === 0 ? (
        <p className="text-gray-400">No jams scheduled. Why not create one?</p>
      ) : (
        jams.map(jam => (
          <div
            key={jam.id}
            onClick={() => onJamClick(jam.id)}
            className="bg-gray-800 p-6 rounded-lg shadow-lg cursor-pointer hover:shadow-xl hover:bg-gray-700 transition"
          >
            <h3 className="text-xl font-semibold mb-2">{jam.name}</h3>
            <p className="text-gray-400">{new Date(jam.date).toLocaleString()}</p>
            <p className="text-gray-400 text-sm">{jam.location}</p>
          </div>
        ))
      )}
    </div>
  </div>
);

/**
 * Form for creating a new jam session.
 */
const CreateJamForm = ({ onCreateJam, onCancel }) => {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !date || !location) return;
    onCreateJam(name, date, location);
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
            placeholder="e.g., 'My Garage'"
          />
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

/**
 * Form for adding a new song to a jam.
 */
const AddSongForm = ({ onAddSong }) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title || !artist) return;
    onAddSong(title, artist);
    setTitle('');
    setArtist('');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-xl space-y-4 mt-6">
      <h3 className="text-xl font-bold mb-3">Add a Song to the Setlist</h3>
      <div>
        <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="song-title">
          Song Title
        </label>
        <input
          id="song-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., 'Sweet Home Chicago'"
        />
      </div>
      <div>
        <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="song-artist">
          Original Artist
        </label>
        <input
          id="song-artist"
          type="text"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          className="w-full bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., 'Robert Johnson'"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition"
        >
          + Add Song
        </button>
      </div>
    </form>
  );
};

/**
 * Details view for a single jam.
 * Shows jam info and the list of songs.
 */
const JamDetail = ({ jam, songs, onSongClick, onAddSong, onBack }) => {
  if (!jam) return <LoadingSpinner />;

  return (
    <div className="p-4">
      <button onClick={onBack} className="text-blue-400 hover:text-blue-300 mb-4">&larr; Back to Jams</button>
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl mb-6">
        <h2 className="text-3xl font-bold mb-2">{jam.name}</h2>
        <p className="text-gray-300 text-lg mb-1">{new Date(jam.date).toLocaleString()}</p>
        <p className="text-gray-400">{jam.location}</p>
      </div>

      <h3 className="text-2xl font-bold mb-4">Setlist</h3>
      <div className="space-y-3">
        {songs.length === 0 ? (
          <p className="text-gray-400">No songs added to this jam yet.</p>
        ) : (
          songs.map(song => (
            <div
              key={song.id}
              onClick={() => onSongClick(song.id)}
              className="bg-gray-700 p-4 rounded-lg shadow-md cursor-pointer hover:bg-gray-600 transition"
            >
              <h4 className="text-lg font-semibold">{song.title}</h4>
              <p className="text-gray-400 text-sm">{song.artist}</p>
            </div>
          ))
        )}
      </div>

      <AddSongForm onAddSong={onAddSong} />
    </div>
  );
};

/**
 * Details view for a single song.
 * Shows roles and allows users to join/leave.
 */
const SongDetail = ({ song, roles, onJoinRole, onLeaveRole, onBack, currentUserId }) => {
  if (!song) return <LoadingSpinner />;

  return (
    <div className="p-4">
      <button onClick={onBack} className="text-blue-400 hover:text-blue-300 mb-4">&larr; Back to Jam</button>
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl mb-6">
        <h2 className="text-3xl font-bold mb-1">{song.title}</h2>
        <p className="text-gray-300 text-lg">{song.artist}</p>
      </div>

      <h3 className="text-2xl font-bold mb-4">Song Roles</h3>
      <div className="space-y-4">
        {roles.length === 0 ? (
          <p className="text-gray-400">No roles found for this song.</p>
        ) : (
          roles.map(role => (
            <div key={role.id} className="bg-gray-700 p-4 rounded-lg shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <div>
                <h4 className="text-lg font-semibold">{role.instrument}</h4>
                {role.status === 'open' ? (
                  <p className="text-green-400 font-semibold">Open</p>
                ) : (
                  <p className="text-red-400">
                    Taken by: <span className="font-semibold text-gray-200">{role.joinedByUserName || '...'}</span>
                  </p>
                )}
              </div>
              <div className="mt-3 sm:mt-0">
                {role.status === 'open' && (
                  <button
                    onClick={() => onJoinRole(role.id)}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition"
                  >
                    Join Role
                  </button>
                )}
                {role.status === 'taken' && role.joinedByUserId === currentUserId && (
                  <button
                    onClick={() => onLeaveRole(role.id)}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition"
                  >
                    Leave Role
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};


// --- Main App Component ---

export default function App() {
  // --- Firebase State Removed ---
  const [userId, setUserId] = useState(MOCK_USER.uid);
  const [userName, setUserName] = useState(MOCK_USER.name);

  // Navigation State
  const [currentView, setCurrentView] = useState('jamList'); // 'jamList', 'createJam', 'jamDetail', 'songDetail', 'profile'
  const [selectedJamId, setSelectedJamId] = useState(null);
  const [selectedSongId, setSelectedSongId] = useState(null);

  // Data State - All data is now held in local state
  const [jams, setJams] = useState([]);
  const [songsByJamId, setSongsByJamId] = useState({}); // e.g., { "jam1_id": [song1, song2] }
  const [rolesBySongId, setRolesBySongId] = useState({}); // e.g., { "song1_id": [role1, role2] }

  // Derived State (what was previously fetched)
  const currentJam = useMemo(() => {
    return jams.find(j => j.id === selectedJamId) || null;
  }, [jams, selectedJamId]);

  const currentSongs = useMemo(() => {
    return songsByJamId[selectedJamId] || [];
  }, [songsByJamId, selectedJamId]);
  
  const currentSong = useMemo(() => {
    return (songsByJamId[selectedJamId] || []).find(s => s.id === selectedSongId) || null;
  }, [songsByJamId, selectedJamId, selectedSongId]);

  const currentRoles = useMemo(() => {
    return rolesBySongId[selectedSongId] || [];
  }, [rolesBySongId, selectedSongId]);


  // UI State
  const [loading, setLoading] = useState(false); // No initial loading needed
  const [modal, setModal] =  useState(null); // { title, message }
  
  // --- All Firebase useEffects have been removed ---

  // --- Auth & Profile ---

  /**
   * Handler for updating the user's profile name.
   */
  const handleUpdateProfile = async (newUserName) => {
    if (!newUserName) return;
    setLoading(true);
    setUserName(newUserName); // Just update local state
    setModal({ title: "Success", message: "Your name has been updated!" });
    setCurrentView('jamList');
    setLoading(false);
  };


  // --- Data Writing (Handlers) ---

  const handleCreateJam = async (name, date, location) => {
    setLoading(true);
    const newJam = {
      id: `jam_${Date.now()}`, // Create a unique local ID
      name,
      date,
      location,
      createdBy: userId,
      createdAt: new Date().toISOString()
    };
    
    setJams(prevJams => [...prevJams, newJam]); // Add new jam to state
    
    setModal({ title: "Success", message: "Jam session created!" });
    setCurrentView('jamList');
    setLoading(false);
  };

  const handleAddSong = async (title, artist) => {
    if (!selectedJamId) return;
    setLoading(true);
    
    // 1. Create the new song document
    const newSongId = `song_${Date.now()}`;
    const newSong = {
      id: newSongId,
      title, 
      artist,
      createdAt: new Date().toISOString()
    };

    // 2. Create default roles
    const defaultRoles = ["Vocals", "Lead Guitar", "Rhythm Guitar", "Bass", "Drums", "Keyboard"];
    const newRoles = defaultRoles.map((instrument, index) => ({
      id: `role_${newSongId}_${index}`,
      instrument: instrument,
      status: "open",
      joinedByUserId: null,
      joinedByUserName: null
    }));

    // 3. Update state
    setSongsByJamId(prevSongs => ({
      ...prevSongs,
      [selectedJamId]: [...(prevSongs[selectedJamId] || []), newSong]
    }));

    setRolesBySongId(prevRoles => ({
      ...prevRoles,
      [newSongId]: newRoles
    }));

    setModal({ title: "Success", message: "Song and default roles added!" });
    setLoading(false);
  };

  const handleJoinRole = async (roleId) => {
    if (!userId || !userName || !selectedSongId) return;
    setLoading(true);
    
    setRolesBySongId(prevRoles => {
      const updatedRoles = (prevRoles[selectedSongId] || []).map(role => {
        if (role.id === roleId) {
          return {
            ...role,
            status: "taken",
            joinedByUserId: userId,
            joinedByUserName: userName
          };
        }
        return role;
      });

      return {
        ...prevRoles,
        [selectedSongId]: updatedRoles
      };
    });
    
    setLoading(false);
  };

  const handleLeaveRole = async (roleId) => {
    if (!selectedSongId) return;
    setLoading(true);

    setRolesBySongId(prevRoles => {
      const updatedRoles = (prevRoles[selectedSongId] || []).map(role => {
        if (role.id === roleId) {
          return {
            ...role,
            status: "open",
            joinedByUserId: null,
            joinedByUserName: null
          };
        }
        return role;
      });

      return {
        ...prevRoles,
        [selectedSongId]: updatedRoles
      };
    });
    
    setLoading(false);
  };


  // --- Navigation Handlers ---

  const goHome = () => {
    setCurrentView('jamList');
    setSelectedJamId(null);
    setSelectedSongId(null);
  };

  const navToCreate = () => setCurrentView('createJam');
  const navToProfile = () => setCurrentView('profile');

  const navToJam = (jamId) => {
    setSelectedJamId(jamId);
    setSelectedSongId(null); // Clear song selection
    setCurrentView('jamDetail');
  };

  const navToSong = (songId) => {
    setSelectedSongId(songId);
    setCurrentView('songDetail');
  };

  const navBackToJam = () => {
    setSelectedSongId(null);
    setCurrentView('jamDetail');
  };

  // --- Render Logic ---

  const renderView = () => {
    if (loading && !modal) return <LoadingSpinner />;
    // No auth check needed
    
    switch (currentView) {
      case 'jamList':
        return <JamList jams={jams} onJamClick={navToJam} onNavCreate={navToCreate} />;
      case 'createJam':
        return <CreateJamForm onCreateJam={handleCreateJam} onCancel={goHome} />;
      case 'jamDetail':
        return <JamDetail jam={currentJam} songs={currentSongs} onSongClick={navToSong} onAddSong={handleAddSong} onBack={goHome} />;
      case 'songDetail':
        return <SongDetail song={currentSong} roles={currentRoles} onJoinRole={handleJoinRole} onLeaveRole={handleLeaveRole} onBack={navBackToJam} currentUserId={userId} />;
      case 'profile':
        return <Profile initialUserName={userName} onSave={handleUpdateProfile} onBack={goHome} userId={userId} />;
      default:
        return <JamList jams={jams} onJ amClick={navToJam} onNavCreate={navToCreate} />;
    }
  };

  return (
    <div className="min-h-screen">
      {modal && <Modal title={modal.title} message={modal.message} onClose={() => setModal(null)} />}
      <Header userId={userId} userName={userName} onNavProfile={navToProfile} onNavHome={goHome} />
      <main className="max-w-4xl mx-auto p-4">
        {renderView()}
      </main>
    </div>
  );
}
