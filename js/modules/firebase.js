import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: 'AIzaSyC1kY4dlbg9v38ZkuYVPJGnSulMEouvw58',
  authDomain: 'nexolink-b8eb5.firebaseapp.com',
  projectId: 'nexolink-b8eb5',
  storageBucket: 'nexolink-b8eb5.appspot.com',
  messagingSenderId: '247675121621',
  appId: '1:247675121621:web:98772b2e0cfbe8a381175c'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };