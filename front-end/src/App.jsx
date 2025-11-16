import React, { useState, useEffect, useCallback, useMemo } from 'react';

// --- Component Imports ---
import LoadingSpinner from './components/LoadingSpinner';
import Modal from './components/Modal';
import Header from './components/Header';

// --- Page Imports ---
import Profile from './pages/Profile';
import JamList from './pages/JamList';
import CreateJamForm from './pages/CreateJamForm';
import JamDetail from './pages/JamDetail';
import SongDetail from './pages/SongDetail';


// --- MOCK DATA & LOCAL STATE ---

// A hard-coded user for the demo
const MOCK_USER = {
  uid: 'demo-user-123',
  name: 'Demo Musician'
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
  const [modal, setModal] = useState(null); // { title, message }
  
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
        return <JamList jams={jams} onJamClick={navToJam} onNavCreate={navToCreate} />;
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