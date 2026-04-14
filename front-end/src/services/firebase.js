import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged as onFirebaseAuthStateChanged,
} from "firebase/auth";

const E2E_AUTH_KEY = "__MYJAM_E2E_AUTH__";

const getE2EAuthConfig = () =>
  typeof window !== "undefined" ? window[E2E_AUTH_KEY] ?? null : null;

const createMockUser = (user) => {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName ?? "",
    photoURL: user.photoURL ?? "",
    async getIdToken() {
      return user.token ?? "playwright-e2e-token";
    },
  };
};

const mockListeners = new Set();
const mockAuth = {
  currentUser: createMockUser(getE2EAuthConfig()?.initialUser ?? null),
};

const emitMockAuthChange = (user) => {
  const nextUser = createMockUser(user);
  mockAuth.currentUser = nextUser;

  const config = getE2EAuthConfig();
  if (config) config.initialUser = user ?? null;

  for (const listener of mockListeners) {
    listener(nextUser);
  }
};

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

let auth;
let signInWithGoogle;
let signInWithFacebook;
let logout;
let onAuthStateChanged;

if (getE2EAuthConfig()?.enabled) {
  auth = mockAuth;

  signInWithGoogle = async () => {
    const config = getE2EAuthConfig() ?? {};
    const nextUser = config.googleUser ?? config.user ?? config.initialUser ?? {
      uid: "e2e-user",
      displayName: "E2E Musician",
      photoURL: "",
      token: "playwright-e2e-token",
    };
    emitMockAuthChange(nextUser);
    return { user: mockAuth.currentUser };
  };

  signInWithFacebook = async () => {
    const config = getE2EAuthConfig() ?? {};
    const nextUser = config.facebookUser ?? config.user ?? config.initialUser ?? {
      uid: "e2e-user",
      displayName: "E2E Musician",
      photoURL: "",
      token: "playwright-e2e-token",
    };
    emitMockAuthChange(nextUser);
    return { user: mockAuth.currentUser };
  };

  logout = async () => {
    emitMockAuthChange(null);
  };

  onAuthStateChanged = (_auth, callback) => {
    mockListeners.add(callback);
    queueMicrotask(() => callback(mockAuth.currentUser));
    return () => mockListeners.delete(callback);
  };
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);

  const googleProvider = new GoogleAuthProvider();
  const facebookProvider = new FacebookAuthProvider();

  signInWithGoogle = () => signInWithPopup(auth, googleProvider);
  signInWithFacebook = () => signInWithPopup(auth, facebookProvider);
  logout = () => signOut(auth);
  onAuthStateChanged = onFirebaseAuthStateChanged;
}

export { auth, signInWithGoogle, signInWithFacebook, logout, onAuthStateChanged };
