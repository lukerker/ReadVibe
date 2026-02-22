import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { auth, db, onAuthStateChanged } from './service/firebase';

import LoginPage from './pages/LoginPage';
import FeedPage from './pages/FeedPage';
import ProfilePage from './pages/ProfilePage';
import SearchPage from './pages/SearchPage';
import SettingPage from './pages/SettingPage';
import FriendsPage from './pages/FriendsPage';
import WishlistPage from './pages/WishlistPage';
import Navbar from './components/Navbar';
import SetNicknameModal from './components/SetNicknameModal';

function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [needsNickname, setNeedsNickname] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                // Check if this user has set a displayName in Firestore
                const snap = await db.collection('users').doc(currentUser.uid).get();
                const data = snap.data();
                // Show nickname modal if doc doesn't exist or displayName is blank
                if (!snap.exists || !data?.displayName?.trim()) {
                    setNeedsNickname(true);
                } else {
                    setNeedsNickname(false);
                }
            } else {
                setNeedsNickname(false);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
            <p style={{ color: '#888' }}>正在啟動 ReadVibe...</p>
        </div>
    );

    return (
        <Router>
            <div className="App">
                {/* Forced nickname setup — blocks all content until done */}
                {user && needsNickname && (
                    <SetNicknameModal onDone={() => setNeedsNickname(false)} />
                )}

                {user && <Navbar user={user} />}
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
                    <Routes>
                        <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
                        <Route path="/" element={user ? <FeedPage /> : <Navigate to="/login" />} />
                        <Route path="/search" element={user ? <SearchPage /> : <Navigate to="/login" />} />
                        <Route path="/friends" element={user ? <FriendsPage /> : <Navigate to="/login" />} />
                        <Route path="/settings" element={user ? <SettingPage /> : <Navigate to="/login" />} />
                        <Route path="/wishlist" element={user ? <WishlistPage /> : <Navigate to="/login" />} />
                        <Route path="/profile/:userId" element={user ? <ProfilePage /> : <Navigate to="/login" />} />
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                </div>
            </div>
        </Router>
    );
}

export default App;