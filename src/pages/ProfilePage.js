import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { auth, db, increment } from '../service/firebase';
import BookRatingModal from '../components/BookRatingModal';

// ── 進度條 ───────────────────────────────────────────────────────
const ProgressBar = ({ current, total }) => {
    const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.8rem', color: '#888' }}>
                    {current > 0 ? `第 ${current} 頁` : '尚未開始'}
                    {total > 0 ? ` / ${total} 頁` : ''}
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: pct === 100 ? '#388e3c' : '#1a1a1a' }}>
                    {pct}%
                </span>
            </div>
            <div style={{ backgroundColor: '#f0f0f0', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                <div style={{
                    backgroundColor: pct === 100 ? '#388e3c' : '#1a1a1a',
                    height: '100%', width: `${pct}%`,
                    borderRadius: '999px', transition: 'width 0.4s ease'
                }} />
            </div>
        </div>
    );
};

// ── Like button for a single moment ─────────────────────────────
const MomentLikeButton = ({ momentId }) => {
    const [liked, setLiked] = React.useState(false);
    const [count, setCount] = React.useState(0);

    React.useEffect(() => {
        const uid = auth.currentUser?.uid;
        // like count
        const unsubCount = db.collection('moments').doc(momentId).collection('likes')
            .onSnapshot(snap => setCount(snap.size));
        // own like
        if (uid) {
            const unsubOwn = db.collection('moments').doc(momentId).collection('likes').doc(uid)
                .onSnapshot(doc => setLiked(doc.exists));
            return () => { unsubCount(); unsubOwn(); };
        }
        return () => unsubCount();
    }, [momentId]);

    const toggle = async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const ref = db.collection('moments').doc(momentId).collection('likes').doc(uid);
        if (liked) {
            await ref.delete();
        } else {
            await ref.set({ likedAt: new Date() });
        }
    };

    return (
        <button onClick={toggle} style={liked ? likedBtnStyle : likeBtnStyle}>
            {liked ? '❤️' : '🤍'} {count > 0 ? count : ''}
        </button>
    );
};

// ── Comment section for a single moment ──────────────────────────
const MomentComments = ({ momentId }) => {
    const [comments, setComments] = React.useState([]);
    const [text, setText] = React.useState('');
    const [posting, setPosting] = React.useState(false);
    const [openMenu, setOpenMenu] = React.useState(null); // commentId of open menu

    React.useEffect(() => {
        const unsub = db.collection('moments').doc(momentId).collection('comments')
            .orderBy('createdAt', 'asc')
            .onSnapshot(snap => setComments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsub();
    }, [momentId]);


    const post = async () => {
        if (!text.trim() || !auth.currentUser) return;
        setPosting(true);
        const uid = auth.currentUser.uid;
        const userDoc = await db.collection('users').doc(uid).get();
        const name = userDoc.exists ? (userDoc.data().displayName || auth.currentUser.email) : auth.currentUser.email;
        const commentRef = db.collection('moments').doc(momentId).collection('comments').doc();
        const batch = db.batch();
        batch.set(commentRef, { userId: uid, displayName: name, content: text.trim(), createdAt: new Date() });
        batch.update(db.collection('moments').doc(momentId), { commentCount: increment(1) });
        await batch.commit();
        setText('');
        setPosting(false);
    };

    const deleteComment = async (commentId) => {
        if (!auth.currentUser) return;
        const batch = db.batch();
        batch.delete(db.collection('moments').doc(momentId).collection('comments').doc(commentId));
        batch.update(db.collection('moments').doc(momentId), { commentCount: increment(-1) });
        await batch.commit();
        setOpenMenu(null);
    };

    const fmt = (ts) => ts?.toDate ? ts.toDate().toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    return (
        <div style={{ marginTop: '12px', borderTop: '1px solid #f0f0f0', paddingTop: '12px' }}>
            {comments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                    {comments.map(c => (
                        <div key={c.id} style={{ ...commentItemStyle, position: 'relative' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <span style={commentAuthorStyle}>{c.authorName}</span>
                                    <span style={commentTimeStyle}>{fmt(c.createdAt)}</span>
                                </div>
                                {auth.currentUser?.uid === c.authorId && (
                                    <div style={{ position: 'relative' }}>
                                        <button
                                            onClick={() => setOpenMenu(openMenu === c.id ? null : c.id)}
                                            style={deleteCommentBtnStyle}>
                                            ⋯
                                        </button>
                                        {openMenu === c.id && (
                                            <div style={commentMenuStyle}>
                                                <button
                                                    onClick={() => deleteComment(c.id)}
                                                    style={commentMenuItemStyle}>
                                                    🗑️ 刪除留言
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <p style={commentTextStyle}>{c.content}</p>
                        </div>
                    ))}
                </div>
            )}
            {auth.currentUser && (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text" placeholder="留個言…" value={text}
                        onChange={e => setText(e.target.value)}
                        style={commentInputStyle}
                    />
                    <button onClick={post} disabled={posting || !text.trim()} style={commentPostBtnStyle}>
                        {posting ? '…' : '發送'}
                    </button>
                </div>
            )}
        </div>
    );
};

// ── Modal: 書籍感想回顧（含按讚 & 留言）─────────────────────────
const BookMomentsModal = ({ book, moments, onClose, ownerName }) => {
    const bookMoments = moments.filter(m => m.bookId === book.id);
    const [openComments, setOpenComments] = React.useState({});
    const fmt = (ts) => ts?.toDate ? ts.toDate().toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    return (
        <div style={bmOverlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={bmModalStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                    {book.thumbnail && <img src={book.thumbnail} alt={book.title} style={{ width: '48px', height: '66px', objectFit: 'cover', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} />}
                    <div style={{ flex: 1 }}>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: '800' }}>{book.title}</h3>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#aaa' }}>{ownerName} 的感想紀錄</p>
                    </div>
                    <button onClick={onClose} style={bmCloseStyle}>✕</button>
                </div>
                <div style={{ height: '1px', backgroundColor: '#f0f0f0', marginBottom: '16px' }} />
                {bookMoments.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#ccc', padding: '30px', fontSize: '0.9rem' }}>還沒有針對這本書的感想紀錄。</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '60vh', overflowY: 'auto' }}>
                        {bookMoments.map(m => (
                            <div key={m.id} style={bmMomentCardStyle}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                                    {m.pageNumber > 0 && <span style={bmPageBadgeStyle}>第 {m.pageNumber} 頁</span>}
                                    <span style={{ fontSize: '0.72rem', color: '#ccc', marginLeft: 'auto' }}>{fmt(m.createdAt)}</span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#333', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.content}</p>
                                {m.imageUrl && <img src={m.imageUrl} alt="" style={{ width: '100%', borderRadius: '8px', marginTop: '10px', maxHeight: '180px', objectFit: 'cover' }} />}
                                {/* Like + comment toggle */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
                                    <MomentLikeButton momentId={m.id} />
                                    <button
                                        onClick={() => setOpenComments(p => ({ ...p, [m.id]: !p[m.id] }))}
                                        style={commentToggleBtnStyle}>
                                        💬 留言
                                    </button>
                                </div>
                                {openComments[m.id] && <MomentComments momentId={m.id} />}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const bmOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const bmModalStyle = { backgroundColor: '#fff', borderRadius: '20px', padding: '24px', width: '90%', maxWidth: '520px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' };
const bmCloseStyle = { background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#aaa', padding: '4px', flexShrink: 0 };
const bmMomentCardStyle = { backgroundColor: '#f8f9fa', borderRadius: '14px', padding: '14px' };
const bmPageBadgeStyle = { fontSize: '0.75rem', backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '3px 8px', borderRadius: '6px', fontWeight: '700' };
const likeBtnStyle = { background: 'none', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.82rem', color: '#666' };
const likedBtnStyle = { ...likeBtnStyle, backgroundColor: '#fff1f2', borderColor: '#fda4af', color: '#e11d48' };
const commentToggleBtnStyle = { background: 'none', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.82rem', color: '#666' };
const commentItemStyle = { padding: '8px 10px', backgroundColor: '#fff', borderRadius: '10px' };
const commentAuthorStyle = { fontSize: '0.78rem', fontWeight: '700', color: '#1a1a1a', marginRight: '6px' };
const commentTimeStyle = { fontSize: '0.7rem', color: '#ccc' };
const commentTextStyle = { fontSize: '0.85rem', color: '#444', margin: '2px 0 0 0' };
const commentInputStyle = { flex: 1, padding: '8px 12px', borderRadius: '10px', border: '1px solid #e0e0e0', fontSize: '0.85rem', outline: 'none' };
const commentPostBtnStyle = { padding: '8px 14px', borderRadius: '10px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer' };
const deleteCommentBtnStyle = { background: 'none', border: 'none', fontSize: '1.1rem', color: '#ccc', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 };
const commentMenuStyle = { position: 'absolute', right: 0, top: '100%', backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', padding: '4px', zIndex: 100, minWidth: '110px' };
const commentMenuItemStyle = { display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.83rem', color: '#dc2626', textAlign: 'left', borderRadius: '7px' };



// ── Modal: 更新進度 ──────────────────────────────────────────────
const UpdateProgressModal = ({ book, onClose, onSave }) => {
    const [page, setPage] = useState(book.currentPage || 0);
    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: '700' }}>📖 更新閱讀進度</h3>
                <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '20px' }}>{book.title}</p>
                <label style={labelStyle}>目前讀到第幾頁</label>
                <input type="number" min="0" max={book.totalPages || 99999} value={page}
                    onChange={e => setPage(Number(e.target.value))} style={inputStyle} />
                {book.totalPages > 0 && (
                    <p style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '8px' }}>
                        共 {book.totalPages} 頁（{Math.round((page / book.totalPages) * 100)}%）
                    </p>
                )}
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                    <button onClick={onClose} style={cancelBtnStyle}>取消</button>
                    <button onClick={() => onSave(page)} style={saveBtnStyle}>儲存</button>
                </div>
            </div>
        </div>
    );
};

// ── Modal: 發表感想 ──────────────────────────────────────────────
const NewMomentModal = ({ book, onClose, onPost }) => {
    const [content, setContent] = useState('');
    const [page, setPage] = useState(book.currentPage || 0);
    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: '700' }}>✨ 發表讀書感想</h3>
                <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '20px' }}>{book.title}</p>
                <label style={labelStyle}>當前頁數</label>
                <input type="number" min="0" value={page}
                    onChange={e => setPage(Number(e.target.value))}
                    style={{ ...inputStyle, marginBottom: '16px' }} />
                <label style={labelStyle}>你的感想 / 摘錄</label>
                <textarea placeholder="今天看到哪裡覺得很有趣，或是想記錄的內容…"
                    value={content} onChange={e => setContent(e.target.value)}
                    style={{ ...inputStyle, height: '120px', resize: 'none' }} />
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                    <button onClick={onClose} style={cancelBtnStyle}>取消</button>
                    <button onClick={() => content.trim() && onPost(content, page)}
                        style={saveBtnStyle} disabled={!content.trim()}>發表</button>
                </div>
            </div>
        </div>
    );
};

// ── Main ProfilePage ─────────────────────────────────────────────
const ProfilePage = () => {
    const { userId } = useParams();
    const isOwnProfile = !userId || userId === auth.currentUser?.uid;
    const targetUid = isOwnProfile ? auth.currentUser?.uid : userId;

    const [books, setBooks] = useState([]);
    const [moments, setMoments] = useState([]);
    const [profileUser, setProfileUser] = useState(null);
    const [updateTarget, setUpdateTarget] = useState(null);
    const [momentTarget, setMomentTarget] = useState(null);
    const [expandedBook, setExpandedBook] = useState(null);
    const [ratingTarget, setRatingTarget] = useState(null);
    const [removeTarget, setRemoveTarget] = useState(null);
    const [returnTarget, setReturnTarget] = useState(null); // book being marked as returned
    const [ownerRatings, setOwnerRatings] = useState({}); // bookId → owner's own rating
    const [bookSearch, setBookSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [isFollowing, setIsFollowing] = useState(false);
    const [bookRatings, setBookRatings] = useState({}); // bookId → { avg, count }

    // 載入個人資料
    useEffect(() => {
        if (!targetUid) return;
        db.collection('users').doc(targetUid).get().then(doc => {
            setProfileUser(doc.exists ? { uid: targetUid, ...doc.data() } : { uid: targetUid, email: '' });
        });
    }, [targetUid]);

    // 確認是否已追蹤
    useEffect(() => {
        if (isOwnProfile || !auth.currentUser || !targetUid) return;
        const unsubscribe = db.collection('users').doc(auth.currentUser.uid)
            .collection('following').doc(targetUid)
            .onSnapshot(doc => setIsFollowing(doc.exists));
        return () => unsubscribe();
    }, [isOwnProfile, targetUid]);

    // 載入書架
    useEffect(() => {
        if (!targetUid) return;
        const unsubBooks = db
            .collection('users').doc(targetUid).collection('books')
            .orderBy('addedAt', 'desc')
            .onSnapshot(async snap => {
                const bookList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setBooks(bookList);
                setLoading(false);

                // Backfill publicShelves for own profile so others can find lenders
                if (isOwnProfile && auth.currentUser) {
                    const uid = auth.currentUser.uid;
                    const userDoc = await db.collection('users').doc(uid).get();
                    const displayName = userDoc.exists
                        ? (userDoc.data().displayName || auth.currentUser.email)
                        : auth.currentUser.email;
                    for (const book of bookList) {
                        const holderRef = db.collection('publicShelves').doc(book.id).collection('holders').doc(uid);
                        const holderSnap = await holderRef.get();
                        if (!holderSnap.exists) {
                            holderRef.set({ userId: uid, displayName, thumbnail: book.thumbnail || '', addedAt: new Date() });
                        }
                    }
                }
            });

        const unsubMoments = db.collection('moments')
            .where('userId', '==', targetUid)
            .onSnapshot(snap => {
                const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                docs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
                setMoments(docs);
            });

        return () => { unsubBooks(); unsubMoments(); };
    }, [targetUid, isOwnProfile]);

    // 載入書架書籍的社群評分均值
    useEffect(() => {
        if (!books.length) return;
        const unsubFns = books.map(book => {
            return db.collection('bookRatings').doc(book.id).collection('ratings')
                .onSnapshot(snap => {
                    const docs = snap.docs.map(d => d.data());
                    const rated = docs.filter(d => d.overall > 0);
                    const avgOverall = rated.length
                        ? rated.reduce((s, d) => s + (d.overall || 0), 0) / rated.length
                        : 0;
                    setBookRatings(prev => ({
                        ...prev,
                        [book.id]: { avg: avgOverall, count: rated.length },
                    }));
                });
        });
        return () => unsubFns.forEach(fn => fn());
    }, [targetUid]);

    // Load owner's personal ratings when viewing others' shelves
    useEffect(() => {
        if (isOwnProfile || !books.length || !targetUid) return;
        const unsubFns = books.map(book =>
            db.collection('bookRatings').doc(book.id).collection('ratings').doc(targetUid)
                .onSnapshot(snap => {
                    if (snap.exists) {
                        setOwnerRatings(prev => ({ ...prev, [book.id]: snap.data() }));
                    }
                })
        );
        return () => unsubFns.forEach(fn => fn());
    }, [isOwnProfile, targetUid, books.length]);

    const handleFollow = async () => {
        if (!auth.currentUser) return;
        await db.collection('users').doc(auth.currentUser.uid)
            .collection('following').doc(targetUid)
            .set({ followedAt: new Date() });
    };
    const handleUnfollow = async () => {
        if (!auth.currentUser) return;
        await db.collection('users').doc(auth.currentUser.uid)
            .collection('following').doc(targetUid).delete();
    };

    const saveProgress = async (newPage) => {
        if (!updateTarget || !auth.currentUser) return;
        await db.collection('users').doc(auth.currentUser.uid)
            .collection('books').doc(updateTarget.id).update({ currentPage: newPage });
        setUpdateTarget(null);
    };

    const postMoment = async (content, pageNum) => {
        if (!momentTarget || !auth.currentUser) return;
        const user = auth.currentUser;
        const userDoc = await db.collection('users').doc(user.uid).get();
        const displayName = userDoc.exists ? userDoc.data().displayName || user.email : user.email;
        await db.collection('moments').add({
            userId: user.uid, displayName,
            bookId: momentTarget.id, bookTitle: momentTarget.title,
            bookThumbnail: momentTarget.thumbnail || '',
            bookAuthor: momentTarget.author || '',
            content, pageNumber: pageNum, createdAt: new Date(),
        });
        if (pageNum !== momentTarget.currentPage) {
            await db.collection('users').doc(user.uid)
                .collection('books').doc(momentTarget.id).update({ currentPage: pageNum });
        }
        setMomentTarget(null);
    };

    const removeBook = async () => {
        if (!removeTarget || !auth.currentUser) return;
        const uid = auth.currentUser.uid;
        const bookId = removeTarget.id;
        try {
            // 1. 找出該書的所有感想
            const momentSnap = await db.collection('moments')
                .where('userId', '==', uid)
                .where('bookId', '==', bookId)
                .get();
            // 2. 刪除每則感想的 likes + comments + 本身
            for (const mDoc of momentSnap.docs) {
                const [likesSnap, commentsSnap] = await Promise.all([
                    mDoc.ref.collection('likes').get(),
                    mDoc.ref.collection('comments').get(),
                ]);
                const batch = db.batch();
                likesSnap.docs.forEach(d => batch.delete(d.ref));
                commentsSnap.docs.forEach(d => batch.delete(d.ref));
                batch.delete(mDoc.ref);
                await batch.commit();
            }
            // 3. 刪除書架記錄（評分保留）
            await db.collection('users').doc(uid).collection('books').doc(bookId).delete();
            // 4. 刪除 publicShelves 鏡像
            await db.collection('publicShelves').doc(bookId).collection('holders').doc(uid).delete();
        } catch (e) { alert('移除失敗：' + e.message); }
        setRemoveTarget(null);
    };

    const returnBook = async () => {
        if (!returnTarget || !auth.currentUser) return;
        const uid = auth.currentUser.uid;
        const book = returnTarget;
        try {
            const batch = db.batch();
            const bookRef = db.collection('users').doc(uid).collection('books').doc(book.id);
            // 1. 清除借出狀態
            batch.update(bookRef, { lentTo: null, lentToName: null, lentAt: null, lendRequestId: null });
            // 2. publicShelves 恢復可借
            batch.update(
                db.collection('publicShelves').doc(book.id).collection('holders').doc(uid),
                { lentTo: null }
            );
            // 3. 刪除 lendRequest 文件並清除借書者的願望清單
            if (book.lendRequestId) {
                const reqSnap = await db.collection('lendRequests').doc(book.lendRequestId).get();
                if (reqSnap.exists) {
                    const reqData = reqSnap.data();
                    // 刪除借書者願望清單該書
                    batch.delete(db.collection('users').doc(reqData.requesterId).collection('wishlist').doc(book.id));
                    // 刪除 lendRequest
                    batch.delete(db.collection('lendRequests').doc(book.lendRequestId));
                }
            }
            await batch.commit();
        } catch (e) { alert('記錄還書失敗：' + e.message); }
        setReturnTarget(null);
    };

    if (loading) return <div style={loadingStyle}>載入書架中…</div>;

    const displayName = profileUser?.displayName || profileUser?.email || '這位用戶';

    return (
        <div style={pageStyle}>
            {updateTarget && (
                <UpdateProgressModal book={updateTarget} onClose={() => setUpdateTarget(null)} onSave={saveProgress} />
            )}
            {momentTarget && (
                <NewMomentModal book={momentTarget} onClose={() => setMomentTarget(null)} onPost={postMoment} />
            )}
            {ratingTarget && (
                <BookRatingModal
                    bookId={ratingTarget.id}
                    bookTitle={ratingTarget.title}
                    bookThumbnail={ratingTarget.thumbnail || ''}
                    canRate={isOwnProfile}
                    onClose={() => setRatingTarget(null)} />
            )}
            {removeTarget && (
                <div style={overlayStyle}>
                    <div style={modalStyle}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.05rem', fontWeight: '800' }}>🗑️ 移除書籍</h3>
                        <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '6px' }}>確定要將「<strong>{removeTarget.title}</strong>」從書架移除嗎？</p>
                        <p style={{ fontSize: '0.82rem', color: '#e55', backgroundColor: '#fff5f5', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', margin: '0 0 20px 0', lineHeight: 1.6 }}>
                            ⚠️ 這本書的所有<strong>感想紀錄</strong>也會一併刪除，且<strong>無法復原</strong>。
                            評分資料會保留在社群中，但你將無法再看到自己的評分。
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setRemoveTarget(null)} style={cancelBtnStyle}>取消</button>
                            <button onClick={removeBook} style={{ ...saveBtnStyle, backgroundColor: '#dc2626' }}>確認移除</button>
                        </div>
                    </div>
                </div>
            )}
            {expandedBook && (
                <BookMomentsModal
                    book={expandedBook}
                    moments={moments}
                    ownerName={displayName}
                    onClose={() => setExpandedBook(null)} />
            )}

            {/* 個人資料區 */}
            <header style={profileHeaderStyle}>
                <div style={bigAvatarStyle}>
                    {displayName[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                    <h2 style={profileNameStyle}>
                        {isOwnProfile ? '我的書架' : `${displayName} 的書架`}
                    </h2>
                    {profileUser?.bio && <p style={profileBioStyle}>{profileUser.bio}</p>}

                </div>
                {!isOwnProfile && auth.currentUser && (
                    isFollowing ? (
                        <button onClick={handleUnfollow} style={unfollowBtnStyle}>✓ 已追蹤</button>
                    ) : (
                        <button onClick={handleFollow} style={followBtnStyle}>＋ 追蹤</button>
                    )
                )}
            </header>

            {/* 書架區 */}
            {(() => {
                const filtered = bookSearch.trim()
                    ? books.filter(b => b.title?.toLowerCase().includes(bookSearch.toLowerCase()) || b.author?.toLowerCase().includes(bookSearch.toLowerCase()))
                    : books;
                return (
                    <section style={sectionStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                            <h3 style={{ ...sectionTitleStyle, margin: 0 }}>📚 書架（{books.length} 本）</h3>
                            {books.length > 0 && (
                                <input type="text" placeholder="搜尋書架中的書…" value={bookSearch}
                                    onChange={e => setBookSearch(e.target.value)} style={bookSearchInputStyle} />
                            )}
                        </div>
                        {books.length === 0 ? (
                            <p style={emptyStyle}>{isOwnProfile ? '你還沒有在書架上放書，去「找新書」搜尋看看吧！' : '這位用戶還沒有書在書架上。'}</p>
                        ) : filtered.length === 0 ? (
                            <p style={emptyStyle}>找不到「{bookSearch}」，試試其他書名或作者。</p>
                        ) : (
                            <div style={bookListStyle}>
                                {filtered.map(book => (
                                    <div key={book.id} style={bookCardStyle}>
                                        <div style={bookCoverWrap}
                                            onClick={() => setExpandedBook(book)}
                                            title="點擊查看感想紀錄">
                                            {book.thumbnail
                                                ? <img src={book.thumbnail} alt={book.title} style={{ ...bookCoverStyle, cursor: 'pointer' }} />
                                                : <div style={coverPlaceholder}>📖</div>
                                            }
                                        </div>
                                        <div style={bookInfoStyle}>
                                            <h4 style={{ ...bookTitleStyle, cursor: 'pointer' }}
                                                onClick={() => setExpandedBook(book)}>
                                                {book.title}
                                                {moments.filter(m => m.bookId === book.id).length > 0 && (
                                                    <span style={momentCountBadgeStyle}> 💬 {moments.filter(m => m.bookId === book.id).length}</span>
                                                )}
                                            </h4>
                                            <p style={bookAuthorStyle}>{book.author}</p>
                                            <div style={{ marginBottom: isOwnProfile ? '16px' : '0' }}>
                                                <ProgressBar current={book.currentPage || 0} total={book.totalPages || 0} />
                                            </div>
                                            {/* Lent-out badge on own shelf */}
                                            {isOwnProfile && book.lentTo && (
                                                <div>
                                                    <div style={lentOutBadgeStyle}>
                                                        📤 已借出給 <strong>{book.lentToName || book.lentTo}</strong>
                                                        {book.lentAt && (
                                                            <span style={{ color: '#6b8abf', marginLeft: '6px', fontSize: '0.75rem' }}>
                                                                · {book.lentAt?.toDate ? book.lentAt.toDate().toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }) : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {returnTarget?.id === book.id ? (
                                                        <div style={returnConfirmStyle}>
                                                            <span style={{ fontSize: '0.82rem' }}>確定「{book.lentToName}」已還書？</span>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <button onClick={() => setReturnTarget(null)} style={smCancelBtnStyle}>取消</button>
                                                                <button onClick={returnBook} style={smConfirmBtnStyle}>確認已還書</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => setReturnTarget(book)} style={returnBtnStyle}>📚 已還書</button>
                                                    )}
                                                </div>
                                            )}
                                            {/* Owner's personal rating when viewing others' shelves */}
                                            {!isOwnProfile && ownerRatings[book.id]?.overall > 0 && (
                                                <div style={ownerRatingRowStyle}>
                                                    <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: '600' }}>他的評分：</span>
                                                    <span style={{ color: '#f59e0b' }}>{'★'.repeat(ownerRatings[book.id].overall)}{'☆'.repeat(5 - ownerRatings[book.id].overall)}</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#aaa' }}>{ownerRatings[book.id].overall}/5</span>
                                                </div>
                                            )}
                                            {/* Community rating display */}
                                            {bookRatings[book.id]?.count > 0 && (
                                                <div style={communityRatingRowStyle}>
                                                    <span style={{ color: '#f59e0b', fontSize: '0.88rem' }}>
                                                        {'★'.repeat(Math.round(bookRatings[book.id].avg))}
                                                        {'☆'.repeat(5 - Math.round(bookRatings[book.id].avg))}
                                                    </span>
                                                    <span style={{ fontSize: '0.78rem', color: '#888', fontWeight: '600' }}>
                                                        {bookRatings[book.id].avg.toFixed(1)}
                                                    </span>
                                                    <span style={{ fontSize: '0.73rem', color: '#bbb' }}>
                                                        ({bookRatings[book.id].count} 人)
                                                    </span>
                                                </div>
                                            )}
                                            {isOwnProfile && (
                                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                    <button onClick={() => setUpdateTarget(book)} style={actionBtnStyle}>📌 更新進度</button>
                                                    <button onClick={() => setMomentTarget(book)} style={secondaryBtnStyle}>✨ 發表感想</button>
                                                    <button onClick={() => setRatingTarget(book)} style={ratingBtnStyle}>⭐ 評分</button>
                                                    <button onClick={() => setRemoveTarget(book)} style={removeBtnStyle}>🗑️ 移除</button>
                                                </div>
                                            )}
                                            {!isOwnProfile && (
                                                <button onClick={() => setRatingTarget(book)} style={secondaryBtnStyle}>📊 查看評分</button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                );
            })()}


        </div>
    );
};

// --- Styles ---
const pageStyle = { maxWidth: '800px', margin: '0 auto', padding: '40px 20px', fontFamily: '"Inter", -apple-system, sans-serif' };
const profileHeaderStyle = {
    display: 'flex', alignItems: 'center', gap: '20px',
    backgroundColor: '#fff', borderRadius: '20px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.06)', padding: '24px', marginBottom: '32px'
};
const bigAvatarStyle = {
    width: '64px', height: '64px', borderRadius: '50%',
    backgroundColor: '#1a1a1a', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: '800', fontSize: '1.5rem', flexShrink: 0
};
const profileNameStyle = { fontSize: '1.4rem', fontWeight: '800', margin: '0 0 4px 0' };
const profileBioStyle = { fontSize: '0.9rem', color: '#555', margin: '0 0 4px 0' };
const profileEmailStyle = { fontSize: '0.8rem', color: '#aaa', margin: 0 };
const followBtnStyle = {
    padding: '9px 20px', borderRadius: '10px', border: 'none',
    backgroundColor: '#1a1a1a', color: '#fff', fontSize: '0.88rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0
};
const unfollowBtnStyle = {
    padding: '9px 20px', borderRadius: '10px', border: '1px solid #ddd',
    backgroundColor: '#fff', color: '#888', fontSize: '0.88rem', fontWeight: '600', cursor: 'pointer', flexShrink: 0
};

const sectionStyle = { marginBottom: '40px' };
const sectionTitleStyle = { fontSize: '1.1rem', fontWeight: '800', margin: '0 0 20px 0', color: '#1a1a1a' };
const emptyStyle = { color: '#aaa', fontSize: '0.95rem', padding: '40px', textAlign: 'center', backgroundColor: '#fafafa', borderRadius: '16px' };
const bookListStyle = { display: 'flex', flexDirection: 'column', gap: '16px' };
const bookCardStyle = {
    display: 'flex', gap: '18px', backgroundColor: '#fff',
    borderRadius: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', padding: '18px'
};
const bookCoverWrap = { width: '72px', flexShrink: 0 };
const bookCoverStyle = { width: '72px', height: '100px', objectFit: 'cover', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' };
const coverPlaceholder = {
    width: '72px', height: '100px', backgroundColor: '#f5f5f5', borderRadius: '8px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem'
};
const bookInfoStyle = { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' };
const bookTitleStyle = { fontSize: '0.95rem', fontWeight: '700', margin: '0 0 4px 0', color: '#1a1a1a' };
const momentCountBadgeStyle = { fontSize: '0.75rem', color: '#1a73e8', fontWeight: '600' };
const bookSearchInputStyle = { flex: 1, minWidth: '160px', padding: '8px 14px', borderRadius: '10px', border: '1px solid #e8e8e8', fontSize: '0.88rem', outline: 'none', backgroundColor: '#fafafa' };
const bookAuthorStyle = { fontSize: '0.82rem', color: '#888', margin: '0 0 14px 0' };
const actionBtnStyle = {
    padding: '8px 14px', borderRadius: '8px', border: 'none',
    backgroundColor: '#1a1a1a', color: '#fff', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer'
};
const secondaryBtnStyle = {
    ...actionBtnStyle, backgroundColor: '#f0f0f0', color: '#1a1a1a'
};
const ratingBtnStyle = {
    ...actionBtnStyle, backgroundColor: '#fffbeb', color: '#d97706', border: '1px solid #fde68a'
};
const removeBtnStyle = {
    ...actionBtnStyle, backgroundColor: '#fff5f5', color: '#dc2626', border: '1px solid #fecaca'
};
const lentOutBadgeStyle = {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
    color: '#1d4ed8', borderRadius: '8px', padding: '4px 10px',
    fontSize: '0.78rem', fontWeight: '600', marginBottom: '6px', flexWrap: 'wrap'
};
const returnBtnStyle = {
    display: 'inline-block', marginBottom: '10px',
    padding: '4px 12px', borderRadius: '8px',
    border: '1px solid #d1d5db', background: '#f9fafb',
    color: '#374151', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer'
};
const returnConfirmStyle = {
    display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
    backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px',
    padding: '8px 12px', marginBottom: '10px', fontSize: '0.82rem'
};
const smCancelBtnStyle = { padding: '4px 10px', borderRadius: '6px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600' };
const smConfirmBtnStyle = { padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '700' };
const ownerRatingRowStyle = {
    display: 'flex', alignItems: 'center', gap: '5px', margin: '6px 0 10px'
};
const communityRatingRowStyle = {
    display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px'
};

const momentCardStyle = {
    display: 'flex', gap: '14px', backgroundColor: '#fff',
    borderRadius: '14px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', padding: '16px'
};
const momentThumbStyle = { width: '44px', height: '60px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 };
const bookBadgeStyle = {
    fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#f0f0f0',
    color: '#555', padding: '3px 8px', borderRadius: '6px'
};
const pageBadgeStyle = {
    fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#e8f0fe',
    color: '#1a73e8', padding: '3px 8px', borderRadius: '6px'
};
const momentContentStyle = { fontSize: '0.93rem', color: '#333', lineHeight: 1.6, margin: '0 0 6px 0', whiteSpace: 'pre-wrap' };
const timeStyle = { fontSize: '0.73rem', color: '#bbb', margin: 0 };
const loadingStyle = { textAlign: 'center', padding: '100px', color: '#888', fontFamily: 'sans-serif' };

// Modal styles
const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center'
};
const modalStyle = {
    backgroundColor: '#fff', borderRadius: '20px', padding: '32px',
    width: '90%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
};
const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '8px', color: '#444' };
const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: '10px',
    border: '1px solid #eee', fontSize: '1rem', boxSizing: 'border-box', outline: 'none'
};
const cancelBtnStyle = {
    flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #ddd',
    backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '600'
};
const saveBtnStyle = {
    flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
    backgroundColor: '#1a1a1a', color: '#fff', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '600'
};

export default ProfilePage;
