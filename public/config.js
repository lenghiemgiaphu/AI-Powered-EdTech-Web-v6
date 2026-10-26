// Copy this template and fill in your own keys.
// WARNING: anything in a client-side file is visible to every visitor.
// For production, proxy Gemini calls through your own server so the key stays private.
const config = {
  GEMINI_API_KEY: "YOUR_KEY_HERE",
  GEMINI_MODEL: "gemini-2.5-flash",

  // Firebase Console -> Project settings -> General -> "Your apps" (Web app)
  // Also enable Authentication -> Sign-in method -> Google and Email/Password,
  // and add your domain under Authentication -> Settings -> Authorized domains.
  firebase: {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    appId: "YOUR_FIREBASE_APP_ID",
  },
};
