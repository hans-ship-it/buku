// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCtqMC1d7TVwosxtjwfkQJlWBjOsdlTkcQ",
    authDomain: "bendahara-app-82371.firebaseapp.com",
    projectId: "bendahara-app-82371",
    storageBucket: "bendahara-app-82371.firebasestorage.app",
    messagingSenderId: "803674056048",
    appId: "1:803674056048:web:bc8af98359d2f5d6239bb5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
