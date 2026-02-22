import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";

const firebaseConfig = {
    apiKey: "AIzaSyCwvaSpvLGEp9sSQd_vRYaj41qM9GrQ3rI",
    authDomain: "book-vibe-d5081.firebaseapp.com",
    projectId: "book-vibe-d5081",
    storageBucket: "book-vibe-d5081.firebasestorage.app",
    messagingSenderId: "1077601480902",
    appId: "1:1077601480902:web:a2082126010115558e27c7",
    measurementId: "G-JTLP8XWZFZ"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Auth helpers (same interface as modular API)
const signInWithEmailAndPassword = (a, email, pw) => a.signInWithEmailAndPassword(email, pw);
const createUserWithEmailAndPassword = (a, email, pw) => a.createUserWithEmailAndPassword(email, pw);
const signOut = (a) => a.signOut();
const onAuthStateChanged = (a, cb) => a.onAuthStateChanged(cb);

// Firestore FieldValue helpers
const arrayUnion = (...els) => firebase.firestore.FieldValue.arrayUnion(...els);
const arrayRemove = (...els) => firebase.firestore.FieldValue.arrayRemove(...els);
const increment = (n) => firebase.firestore.FieldValue.increment(n);

export {
    auth, db, storage,
    arrayUnion, arrayRemove, increment,
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged
};