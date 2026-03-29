import { getAnalytics, isSupported } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAiC-U155Z6QZ_fFU54by8dG3hbpx56-f4",
  authDomain: "epriscription-bb066.firebaseapp.com",
  projectId: "epriscription-bb066",
  storageBucket: "epriscription-bb066.firebasestorage.app",
  messagingSenderId: "35872352364",
  appId: "1:35872352364:web:0c000379edc3c1029b9049",
  measurementId: "G-0YSRHL8LST",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDb = getFirestore(firebaseApp);

export async function ensureAnonymousFirebaseSession() {
  if (firebaseAuth.currentUser) {
    return firebaseAuth.currentUser;
  }

  const credential = await signInAnonymously(firebaseAuth);
  return credential.user;
}

if (typeof window !== "undefined") {
  void isSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(firebaseApp);
      }
    })
    .catch(() => {
      // Analytics is optional; the app should keep working even if it is unavailable.
    });
}
