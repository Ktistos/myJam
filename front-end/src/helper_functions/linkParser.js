/**
 * Analyzes a URL to determine if it is Spotify or YouTube.
 */
export const parseSongLink = async (url) => {
    let service = null;
    let id = null;
  
    // 1. Check for Spotify
    // Matches: open.spotify.com/track/12345...
    const spotifyRegex = /spotify\.com\/track\/([a-zA-Z0-9]+)/;
    const spotifyMatch = url.match(spotifyRegex);
    
    if (spotifyMatch) {
      service = 'Spotify';
      id = spotifyMatch[1];
    }
  
    // 2. Check for YouTube
    // Matches: youtube.com/watch?v=12345 or youtu.be/12345
    const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/;
    const youtubeMatch = url.match(youtubeRegex);
  
    if (youtubeMatch) {
      service = 'YouTube';
      id = youtubeMatch[1];
    }
  
    if (!service) {
      throw new Error("Link not recognized. Please use a standard Spotify or YouTube link.");
    }
  
    // --- MOCK API CALL ---
    // In a real app, you would send 'id' and 'service' to your backend here.
    // Your backend would call the Spotify/Google API and return the JSON.
    // We will simulate network delay and return fake data based on the ID.
    
    return new Promise((resolve) => {
      setTimeout(() => {
        if (service === 'Spotify') {
          resolve({
            title: "Simulated Spotify Song",
            artist: "Simulated Artist",
            originalLink: url
          });
        } else {
          resolve({
            title: "Simulated YouTube Video",
            artist: "YouTube Creator",
            originalLink: url
          });
        }
      }, 1000); // 1 second delay
    });
  };