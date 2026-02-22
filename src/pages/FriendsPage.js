import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../service/firebase';

const getDisplayName = (u) => u?.displayName || (u?.email?.split('@')[0]) || '用戶';

// ── Reusable Avatar (clickable) ───────────────────────────────────
const Avatar = ({ avatarUrl, displayName, size = 44, uid, navigate }) => {
    const style = {
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        cursor: uid ? 'pointer' : 'default', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontWeight: '800', fontSize: size * 0.38,
        objectFit: 'cover', boxShadow: '0 1px 4px rgba(0,0,0,0.12)'
    };
    const handle = () => uid && navigate && navigate(`/profile/${uid}`);
    if (avatarUrl) return <img src={avatarUrl} alt={displayName} style={{ ...style }} onClick={handle} />;
    return <div style={{ ...style, backgroundColor: '#1a1a1a', color: '#fff' }} onClick={handle}>
        {(displayName || '?')[0].toUpperCase()}
    </div>;
};

// ── Friend Card ───────────────────────────────────────────────────
const PersonCard = ({ person, isFollowing, onFollow, onUnfollow, currentlyReading, navigate }) => {
    return (
        <div style={cardStyle}>
            <div style={cardTopStyle}>
                <Avatar avatarUrl={person.avatarUrl} displayName={getDisplayName(person)} size={46} uid={person.uid} navigate={navigate} />
                <div style={{ flex: 1 }}>
                    <p style={nameStyle}>{getDisplayName(person)}</p>
                </div>
                {isFollowing ? (
                    <button onClick={() => onUnfollow(person.uid)} style={unfollowBtnStyle}>✓ 已追蹤</button>
                ) : (
                    <button onClick={() => onFollow(person)} style={followBtnStyle}>＋ 追蹤</button>
                )}
            </div>

            {currentlyReading && currentlyReading.length > 0 && (
                <div style={readingListStyle}>
                    <p style={readingLabelStyle}>📖 正在閱讀</p>
                    {currentlyReading.slice(0, 2).map(book => {
                        const pct = book.totalPages > 0 ? Math.min(100, Math.round((book.currentPage || 0) / book.totalPages * 100)) : 0;
                        return (
                            <div key={book.id} style={miniBookStyle}>
                                {book.thumbnail && <img src={book.thumbnail} alt={book.title} style={miniCoverStyle} />}
                                <div style={{ flex: 1 }}>
                                    <p style={miniTitleStyle}>{book.title}</p>
                                    <div style={{ backgroundColor: '#f0f0f0', borderRadius: '999px', height: '5px' }}>
                                        <div style={{ backgroundColor: '#1a1a1a', height: '100%', width: `${pct}%`, borderRadius: '999px' }} />
                                    </div>
                                    <p style={{ margin: '3px 0 0 0', fontSize: '0.73rem', color: '#aaa' }}>{pct}%</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            <div style={{ marginTop: '14px' }} onClick={() => navigate(`/profile/${person.uid}`)}>
                <span style={viewShelfStyle}>查看書架 →</span>
            </div>
        </div>
    );
};

// ── Main FriendsPage ──────────────────────────────────────────────
const FriendsPage = () => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [following, setFollowing] = useState([]);
    const [followers, setFollowers] = useState([]);
    const [followingIds, setFollowingIds] = useState(new Set());
    const [followingReading, setFollowingReading] = useState({});

    const loadBooksForUser = async (uid) => {
        const snap = await db.collection('users').doc(uid).collection('books')
            .orderBy('addedAt', 'desc').limit(2).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    };

    // 載入「追蹤中」
    useEffect(() => {
        if (!auth.currentUser) return;
        const unsub = db.collection('users').doc(auth.currentUser.uid)
            .collection('following').onSnapshot(async snap => {
                const ids = new Set(snap.docs.map(d => d.id));
                setFollowingIds(ids);
                const friendData = await Promise.all(
                    snap.docs.map(async d => {
                        const u = await db.collection('users').doc(d.id).get();
                        return u.exists ? { uid: d.id, ...u.data() } : null;
                    })
                );
                const valid = friendData.filter(Boolean);
                setFollowing(valid);
                const readingMap = {};
                await Promise.all(valid.map(async f => {
                    readingMap[f.uid] = await loadBooksForUser(f.uid);
                }));
                setFollowingReading(readingMap);
            });
        return () => unsub();
    }, []);

    // 載入「追蹤我的人」
    useEffect(() => {
        if (!auth.currentUser) return;
        const unsub = db.collection('users').doc(auth.currentUser.uid)
            .collection('followers').onSnapshot(async snap => {
                const followerData = await Promise.all(
                    snap.docs.map(async d => {
                        const u = await db.collection('users').doc(d.id).get();
                        return u.exists ? { uid: d.id, ...u.data() } : null;
                    })
                );
                setFollowers(followerData.filter(Boolean));
            });
        return () => unsub();
    }, []);

    const handleFollow = async (user) => {
        if (!auth.currentUser) return;
        const meUid = auth.currentUser.uid;
        const batch = db.batch();
        // 我追蹤對方
        batch.set(db.collection('users').doc(meUid).collection('following').doc(user.uid), { followedAt: new Date() });
        // 對方的 followers 裡加上我
        batch.set(db.collection('users').doc(user.uid).collection('followers').doc(meUid), { followedAt: new Date() });
        await batch.commit();
    };

    const handleUnfollow = async (uid) => {
        if (!auth.currentUser) return;
        const meUid = auth.currentUser.uid;
        const batch = db.batch();
        batch.delete(db.collection('users').doc(meUid).collection('following').doc(uid));
        batch.delete(db.collection('users').doc(uid).collection('followers').doc(meUid));
        await batch.commit();
    };

    const handleSearch = async () => {
        if (!searchQuery.trim() || !auth.currentUser) return;
        setSearching(true);
        setSearchResults([]);
        try {
            const [nameSnap, emailSnap] = await Promise.all([
                db.collection('users').where('displayName', '>=', searchQuery).where('displayName', '<=', searchQuery + '\uf8ff').limit(10).get(),
                db.collection('users').where('email', '>=', searchQuery).where('email', '<=', searchQuery + '\uf8ff').limit(10).get()
            ]);
            const seen = new Set();
            const results = [];
            [...nameSnap.docs, ...emailSnap.docs].forEach(doc => {
                if (!seen.has(doc.id) && doc.id !== auth.currentUser.uid) {
                    seen.add(doc.id);
                    results.push({ uid: doc.id, ...doc.data() });
                }
            });
            setSearchResults(results);
        } catch (e) { alert('搜尋失敗：' + e.message); }
        finally { setSearching(false); }
    };

    return (
        <div style={pageStyle}>
            {/* 搜尋 */}
            <section style={sectionStyle}>
                <h2 style={titleStyle}>🔎 搜尋用戶</h2>
                <p style={subtitleStyle}>輸入暱稱找到朋友，追蹤後就能看到他們的書架。</p>
                <div style={searchBarStyle}>
                    <input type="text" placeholder="輸入暱稱…" value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        style={inputStyle} />
                    <button onClick={handleSearch} style={searchBtnStyle} disabled={searching}>
                        {searching ? '搜尋中…' : '搜尋'}
                    </button>
                </div>
                {searchResults.length > 0 && (
                    <div style={resultsBoxStyle}>
                        {searchResults.map(user => (
                            <div key={user.uid} style={resultItemStyle}>
                                <Avatar avatarUrl={user.avatarUrl} displayName={getDisplayName(user)} size={38} uid={user.uid} navigate={navigate} />
                                <p style={{ margin: 0, fontWeight: '700', fontSize: '0.9rem', flex: 1, cursor: 'pointer' }}
                                    onClick={() => navigate(`/profile/${user.uid}`)}>
                                    {getDisplayName(user)}
                                </p>
                                {followingIds.has(user.uid)
                                    ? <button onClick={() => handleUnfollow(user.uid)} style={unfollowBtnStyle}>✓ 已追蹤</button>
                                    : <button onClick={() => handleFollow(user)} style={followBtnStyle}>＋ 追蹤</button>
                                }
                            </div>
                        ))}
                    </div>
                )}
                {!searching && searchQuery && searchResults.length === 0 && (
                    <p style={hintStyle}>找不到用戶，試試其他暱稱。</p>
                )}
            </section>

            {/* 我追蹤的人 */}
            <section style={sectionStyle}>
                <h2 style={titleStyle}>👥 我追蹤的人（{following.length}）</h2>
                {following.length === 0
                    ? <p style={emptyStyle}>你還沒有追蹤任何人。在上方搜尋你的朋友吧！</p>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {following.map(f => <PersonCard key={f.uid} person={f} isFollowing={followingIds.has(f.uid)} onFollow={handleFollow} onUnfollow={handleUnfollow} currentlyReading={followingReading[f.uid]} navigate={navigate} />)}
                    </div>
                }
            </section>

            {/* 追蹤我的人 */}
            <section style={sectionStyle}>
                <h2 style={titleStyle}>🙌 追蹤我的人（{followers.length}）</h2>
                {followers.length === 0
                    ? <p style={emptyStyle}>還沒有人追蹤你，快去找朋友互相追蹤吧！</p>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {followers.map(f => (
                            <div key={f.uid} style={followerItemStyle}>
                                <Avatar avatarUrl={f.avatarUrl} displayName={getDisplayName(f)} size={42} uid={f.uid} navigate={navigate} />
                                <span style={{ fontWeight: '700', fontSize: '0.92rem', flex: 1, cursor: 'pointer' }}
                                    onClick={() => navigate(`/profile/${f.uid}`)}>{getDisplayName(f)}</span>
                                {followingIds.has(f.uid)
                                    ? <button onClick={() => handleUnfollow(f.uid)} style={unfollowBtnStyle}>✓ 已追蹤</button>
                                    : <button onClick={() => handleFollow(f)} style={followBtnStyle}>＋ 追蹤</button>
                                }
                            </div>
                        ))}
                    </div>
                }
            </section>
        </div>
    );
};

// ── Styles ────────────────────────────────────────────────────────
const pageStyle = { maxWidth: '800px', margin: '0 auto', padding: '40px 20px', fontFamily: '"Inter", -apple-system, sans-serif' };
const sectionStyle = { marginBottom: '48px' };
const titleStyle = { fontSize: '1.4rem', fontWeight: '800', margin: '0 0 8px 0' };
const subtitleStyle = { color: '#888', fontSize: '0.88rem', margin: '0 0 18px 0' };
const searchBarStyle = { display: 'flex', gap: '12px', marginBottom: '16px' };
const inputStyle = { flex: 1, padding: '13px 18px', borderRadius: '12px', border: '1px solid #e0e0e0', fontSize: '0.95rem', outline: 'none' };
const searchBtnStyle = { padding: '13px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' };
const resultsBoxStyle = { backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', overflow: 'hidden' };
const resultItemStyle = { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', borderBottom: '1px solid #f5f5f5' };
const hintStyle = { color: '#aaa', fontSize: '0.9rem', textAlign: 'center', padding: '20px' };
const emptyStyle = { color: '#aaa', fontSize: '0.92rem', padding: '32px', textAlign: 'center', backgroundColor: '#fafafa', borderRadius: '14px' };
const cardStyle = { backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 4px 14px rgba(0,0,0,0.07)', padding: '18px' };
const cardTopStyle = { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' };
const nameStyle = { margin: 0, fontWeight: '700', fontSize: '0.95rem' };
const followBtnStyle = { padding: '7px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer' };
const unfollowBtnStyle = { padding: '7px 16px', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: '#fff', color: '#888', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer' };
const readingListStyle = { borderTop: '1px solid #f0f0f0', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' };
const readingLabelStyle = { margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' };
const miniBookStyle = { display: 'flex', gap: '10px', alignItems: 'center' };
const miniCoverStyle = { width: '30px', height: '42px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' };
const miniTitleStyle = { margin: '0 0 5px 0', fontSize: '0.8rem', fontWeight: '600', color: '#333' };
const viewShelfStyle = { fontSize: '0.82rem', color: '#1a73e8', fontWeight: '600', cursor: 'pointer' };
const followerItemStyle = { display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', padding: '14px 18px' };

export default FriendsPage;
