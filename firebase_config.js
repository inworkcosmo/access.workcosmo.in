// Firebase Configuration
// Replace placeholders with your actual project keys from the Firebase Console
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const firebaseConfig = {
    apiKey: "AIzaSyA5EVkg2K1YoP65Ej3HBGgfHDBOOwnKbSs",
    authDomain: "inworkcosmo.firebaseapp.com",
    projectId: "inworkcosmo",
    storageBucket: "inworkcosmo.firebasestorage.app",
    messagingSenderId: "384225621712",
    appId: "1:384225621712:web:5767b990f5b588a43350d5",
    measurementId: "G-TJH9MJCZHC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
