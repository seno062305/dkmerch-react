// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyADuozDbnUVgoRzbP-QUASAu1TD1QEB8lY",
  authDomain: "dkmerch-ecommerce-83bbe.firebaseapp.com",
  projectId: "dkmerch-ecommerce-83bbe",
  storageBucket: "dkmerch-ecommerce-83bbe.firebasestorage.app",
  messagingSenderId: "219258756948",
  appId: "1:219258756948:web:a4bf522fd309a3037372c1",
  measurementId: "G-H619KNWGY8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Initialize Analytics (optional, only works in browser)
let analytics = null;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

export { analytics };
export default app;