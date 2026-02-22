import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { auth, db } from '../service/firebase';

// ── Helpers ────────────────────────────────────────────────────────
const fmt = (ts) => ts?.toDate
    ? ts.toDate().toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
const fmtDate = (ts) => ts?.toDate
    ? ts.toDate().toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';

// ── Lenders for a wishlist book ─────────────────────────────────────
const LendersList = ({ bookId, onBorrow }) => {
    const [lenders, setLenders] = useState([]);
    const uid = auth.currentUser?.uid;

    useEffect(() => {
        // publicShelves/{bookId}/holders/{userId} — written when user adds book to shelf
        const unsub = db.collection('publicShelves').doc(bookId).collection('holders')
            .onSnapshot(snap => {
                const results = snap.docs
                    .map(d => ({ uid: d.id, ...d.data() }))
                    .filter(h => h.uid !== uid && !h.lentTo);
                setLenders(results);
            });
        return () => unsub();
    }, [bookId, uid]);

    if (lenders.length === 0) return (
        <span style={{ fontSize: '0.78rem', color: '#ccc' }}>目前無人可借（社群中沒有人加入過書架）</span>
    );

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
            {lenders.map(l => (
                <button key={l.uid} onClick={() => onBorrow(l)} style={lenderBtnStyle}>
                    📤 向 {l.displayName || l.uid} 借閱
                </button>
            ))}
        </div>
    );
};

// ── Borrow Confirm Modal ────────────────────────────────────────────
const BorrowModal = ({ book, lender, onClose, onSent }) => {
    const [sending, setSending] = useState(false);

    const sendRequest = async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        setSending(true);
        const userDoc = await db.collection('users').doc(uid).get();
        const ud = userDoc.exists ? userDoc.data() : {};
        const ownerDisplayName = lender.displayName || lender.name || lender.uid;
        await db.collection('lendRequests').add({
            bookId: book.id,
            bookTitle: book.title,
            bookThumbnail: book.thumbnail || '',
            requesterId: uid,
            requesterName: ud.displayName || auth.currentUser.email,
            requesterEmail: auth.currentUser.email,
            ownerId: lender.uid,
            ownerName: ownerDisplayName,
            status: 'pending',
            createdAt: new Date(),
        });
        setSending(false);
        onSent();
    };

    return (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={modalStyle}>
                <h3 style={{ margin: '0 0 12px', fontWeight: '800', fontSize: '1rem' }}>📤 送出借閱請求</h3>
                <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '16px' }}>
                    向 <strong>{lender.name}</strong> 借閱《<strong>{book.title}</strong>》？
                </p>
                <p style={{ fontSize: '0.82rem', color: '#aaa', backgroundColor: '#f8f8f8', borderRadius: '10px', padding: '10px 12px', marginBottom: '20px', lineHeight: 1.6 }}>
                    📧 對方同意後，雙方可看到彼此的 Email 以便聯絡。
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={onClose} style={cancelBtnStyle}>取消</button>
                    <button onClick={sendRequest} disabled={sending} style={saveBtnStyle}>
                        {sending ? '送出中…' : '確認送出'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Remove wishlist confirm ─────────────────────────────────────────
const RemoveWishlistConfirm = ({ book, onConfirm, onCancel }) => (
    <div style={{ ...confirmBannerStyle }}>
        <span style={{ fontSize: '0.85rem' }}>確定從願望清單移除《{book.title}》？</span>
        <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onCancel} style={smCancelStyle}>取消</button>
            <button onClick={onConfirm} style={smDeleteStyle}>移除</button>
        </div>
    </div>
);

// ── Main WishlistPage ───────────────────────────────────────────────
const WishlistPage = () => {
    const uid = auth.currentUser?.uid;
    const [wishlist, setWishlist] = useState([]);
    const [myRequests, setMyRequests] = useState([]); // requests I sent
    const [incomingRequests, setIncomingRequests] = useState([]); // requests to me (I'm owner)
    const [tab, setTab] = useState('wishlist'); // 'wishlist' | 'incoming' | 'outgoing'
    const [loading, setLoading] = useState(true);
    const [borrowTarget, setBorrowTarget] = useState(null); // { book, lender }
    const [removeConfirm, setRemoveConfirm] = useState(null);
    const [cancelConfirmId, setCancelConfirmId] = useState(null); // pending request to cancel
    const [sentNotice, setSentNotice] = useState(false);

    // Wishlist
    useEffect(() => {
        if (!uid) return;
        const unsub = db.collection('users').doc(uid).collection('wishlist')
            .orderBy('addedAt', 'desc')
            .onSnapshot(snap => {
                setWishlist(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
            });
        return () => unsub();
    }, [uid]);

    // My outgoing requests
    useEffect(() => {
        if (!uid) return;
        const unsub = db.collection('lendRequests')
            .where('requesterId', '==', uid)
            .onSnapshot(snap => setMyRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsub();
    }, [uid]);

    // Incoming requests (I'm the owner)
    useEffect(() => {
        if (!uid) return;
        const unsub = db.collection('lendRequests')
            .where('ownerId', '==', uid)
            .onSnapshot(snap => setIncomingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsub();
    }, [uid]);

    const removeFromWishlist = async (bookId) => {
        await db.collection('users').doc(uid).collection('wishlist').doc(bookId).delete();
        setRemoveConfirm(null);
    };

    const cancelRequest = async (requestId) => {
        await db.collection('lendRequests').doc(requestId).delete();
        setCancelConfirmId(null);
    };

    const respondToRequest = async (requestId, accept, bookId, requesterId, requesterName) => {
        const batch = db.batch();
        const reqRef = db.collection('lendRequests').doc(requestId);
        if (accept) {
            const myEmail = auth.currentUser.email;
            batch.update(reqRef, {
                status: 'accepted',
                ownerEmail: myEmail,
                respondedAt: new Date(),
            });
            // Mark book as lent out in my shelf
            const bookRef = db.collection('users').doc(uid).collection('books').doc(bookId);
            const bookSnap = await bookRef.get();
            if (bookSnap.exists) {
                batch.update(bookRef, {
                    lentTo: requesterId,
                    lentToName: requesterName,
                    lentAt: new Date(),
                    lendRequestId: requestId,
                });
            }
            // Mark publicShelves holder as lent out so it disappears from lender lists
            batch.update(
                db.collection('publicShelves').doc(bookId).collection('holders').doc(uid),
                { lentTo: true }
            );
        } else {
            batch.update(reqRef, { status: 'declined', respondedAt: new Date() });
        }
        await batch.commit();
    };

    const pendingIncoming = incomingRequests.filter(r => r.status === 'pending').length;

    return (
        <div style={pageStyle}>
            {/* Borrow modal */}
            {borrowTarget && (
                <BorrowModal
                    book={borrowTarget.book}
                    lender={borrowTarget.lender}
                    onClose={() => setBorrowTarget(null)}
                    onSent={() => { setBorrowTarget(null); setSentNotice(true); setTimeout(() => setSentNotice(false), 3000); }}
                />
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '800' }}>📋 願望清單</h2>
                    <p style={{ margin: '4px 0 0', color: '#aaa', fontSize: '0.88rem' }}>想讀的書、借閱請求都在這裡</p>
                </div>
                <Link to="/search" style={addBtnStyle}>＋ 去找新書</Link>
            </div>

            {sentNotice && (
                <div style={successBannerStyle}>✅ 借閱請求已送出！對方同意後你會在「我的請求」看到對方的 Email。</div>
            )}

            {/* Tabs */}
            <div style={tabBarStyle}>
                <button onClick={() => setTab('wishlist')} style={tab === 'wishlist' ? activeTabStyle : tabStyle}>
                    📚 書單（{wishlist.length}）
                </button>
                <button onClick={() => setTab('incoming')} style={tab === 'incoming' ? activeTabStyle : tabStyle}>
                    📬 待處理請求
                    {pendingIncoming > 0 && <span style={badgeStyle}>{pendingIncoming}</span>}
                </button>
                <button onClick={() => setTab('outgoing')} style={tab === 'outgoing' ? activeTabStyle : tabStyle}>
                    📤 我的請求（{myRequests.length}）
                </button>
            </div>

            {/* Wishlist tab */}
            {tab === 'wishlist' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {loading && <p style={emptyStyle}>載入中…</p>}
                    {!loading && wishlist.length === 0 && (
                        <div style={emptyBoxStyle}>
                            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📋</div>
                            <p style={{ color: '#bbb', fontSize: '0.95rem' }}>願望清單是空的</p>
                            <p style={{ color: '#ddd', fontSize: '0.82rem' }}>在「找新書」頁面把想讀的書加入清單！</p>
                        </div>
                    )}
                    {wishlist.map(book => {
                        const req = myRequests.find(r => r.bookId === book.id && r.status === 'accepted');
                        const pendingReq = myRequests.find(r => r.bookId === book.id && r.status === 'pending');
                        return (
                            <div key={book.id} style={bookCardStyle}>
                                {removeConfirm === book.id && (
                                    <RemoveWishlistConfirm
                                        book={book}
                                        onConfirm={() => removeFromWishlist(book.id)}
                                        onCancel={() => setRemoveConfirm(null)}
                                    />
                                )}
                                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                                    {book.thumbnail
                                        ? <img src={book.thumbnail} alt={book.title} style={thumbStyle} />
                                        : <div style={thumbPlaceholderStyle}>📖</div>
                                    }
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                            <div>
                                                <h4 style={bookTitleStyle}>{book.title}</h4>
                                                <p style={bookAuthorStyle}>{book.author}</p>
                                            </div>
                                            <button
                                                onClick={() => setRemoveConfirm(book.id)}
                                                style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '1rem', flexShrink: 0, padding: '2px' }}
                                                title="移除">✕</button>
                                        </div>

                                        {/* Accepted borrow */}
                                        {req ? (
                                            <div style={acceptedBoxStyle}>
                                                ✅ <strong>{req.ownerName}</strong> 同意借閱！
                                                <br />📧 聯絡 Email：<a href={`mailto:${req.ownerEmail}`} style={{ color: '#1a73e8', fontWeight: '700' }}>{req.ownerEmail}</a>
                                            </div>
                                        ) : pendingReq ? (
                                            <div style={pendingBoxStyle}>
                                                ⏳ 已向 <strong>{pendingReq.ownerName}</strong> 送出借閱請求，等待對方回應…
                                            </div>
                                        ) : (
                                            <>
                                                <p style={{ fontSize: '0.78rem', color: '#aaa', marginBottom: '4px' }}>社群中有這本書的人：</p>
                                                <LendersList
                                                    bookId={book.id}
                                                    onBorrow={lender => setBorrowTarget({ book, lender })}
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Incoming requests tab */}
            {tab === 'incoming' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {incomingRequests.length === 0 && <p style={emptyStyle}>目前沒有借閱請求</p>}
                    {incomingRequests.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).map(req => (
                        <div key={req.id} style={{ ...bookCardStyle, borderLeft: req.status === 'pending' ? '4px solid #f59e0b' : req.status === 'accepted' ? '4px solid #22c55e' : '4px solid #e0e0e0' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                {req.bookThumbnail && <img src={req.bookThumbnail} alt={req.bookTitle} style={{ width: '44px', height: '62px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />}
                                <div style={{ flex: 1 }}>
                                    <p style={{ margin: '0 0 3px', fontWeight: '700', fontSize: '0.92rem' }}>{req.bookTitle}</p>
                                    <p style={{ margin: '0 0 6px', fontSize: '0.82rem', color: '#666' }}>
                                        <strong>{req.requesterName}</strong> 想借這本書
                                        <span style={{ color: '#bbb', marginLeft: '8px' }}>{fmt(req.createdAt)}</span>
                                    </p>
                                    {req.status === 'pending' ? (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => respondToRequest(req.id, true, req.bookId, req.requesterId, req.requesterName)} style={acceptBtnStyle}>✓ 同意借出</button>
                                            <button onClick={() => respondToRequest(req.id, false, req.bookId, req.requesterId, req.requesterName)} style={declineBtnStyle}>✕ 拒絕</button>
                                        </div>
                                    ) : req.status === 'accepted' ? (
                                        <div style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: '600' }}>
                                            ✅ 已同意借出 · 借給 <strong>{req.requesterName}</strong>
                                            <br />📧 對方 Email：<a href={`mailto:${req.requesterEmail}`} style={{ color: '#1a73e8' }}>{req.requesterEmail}</a>
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: '0.82rem', color: '#bbb' }}>已拒絕</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Outgoing requests tab */}
            {tab === 'outgoing' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {myRequests.length === 0 && <p style={emptyStyle}>你還沒送出任何借閱請求</p>}
                    {myRequests.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).map(req => (
                        <div key={req.id} style={{ ...bookCardStyle, borderLeft: req.status === 'pending' ? '4px solid #f59e0b' : req.status === 'accepted' ? '4px solid #22c55e' : '4px solid #e0e0e0' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                {req.bookThumbnail && <img src={req.bookThumbnail} alt={req.bookTitle} style={{ width: '44px', height: '62px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />}
                                <div style={{ flex: 1 }}>
                                    <p style={{ margin: '0 0 3px', fontWeight: '700', fontSize: '0.92rem' }}>{req.bookTitle}</p>
                                    <p style={{ margin: '0 0 6px', fontSize: '0.82rem', color: '#666' }}>
                                        向 <strong>{req.ownerName}</strong> 借閱
                                        <span style={{ color: '#bbb', marginLeft: '8px' }}>{fmt(req.createdAt)}</span>
                                    </p>
                                    {req.status === 'pending' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <span style={pendingTagStyle}>⏳ 等待回應</span>
                                                <button
                                                    onClick={() => setCancelConfirmId(req.id)}
                                                    style={declineBtnStyle}>
                                                    撤銷請求
                                                </button>
                                            </div>
                                            {cancelConfirmId === req.id && (
                                                <div style={cancelConfirmStyle}>
                                                    <span style={{ fontSize: '0.83rem' }}>確定要撤銷這個借閱請求？</span>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button onClick={() => setCancelConfirmId(null)} style={smKeepBtnStyle}>保留</button>
                                                        <button onClick={() => cancelRequest(req.id)} style={smCancelActBtnStyle}>確認撤銷</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {req.status === 'accepted' && (
                                        <div style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: '600' }}>
                                            ✅ 對方同意！
                                            <br />📧 聯絡 Email：<a href={`mailto:${req.ownerEmail}`} style={{ color: '#1a73e8' }}>{req.ownerEmail}</a>
                                        </div>
                                    )}
                                    {req.status === 'declined' && <span style={{ fontSize: '0.82rem', color: '#bbb' }}>❌ 對方拒絕</span>}
                                    {req.status === 'returned' && <span style={{ fontSize: '0.82rem', color: '#aaa' }}>📚 已還書，完成</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Styles ──────────────────────────────────────────────────────────
const pageStyle = { maxWidth: '760px', margin: '0 auto', padding: '40px 20px', fontFamily: '"Inter", -apple-system, sans-serif' };
const tabBarStyle = { display: 'flex', gap: '0', borderBottom: '2px solid #f0f0f0', marginBottom: '24px' };
const tabStyle = { flex: 1, padding: '12px 8px', background: 'none', border: 'none', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', color: '#aaa', borderBottom: '2px solid transparent', marginBottom: '-2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' };
const activeTabStyle = { ...tabStyle, color: '#1a1a1a', borderBottomColor: '#1a1a1a' };
const badgeStyle = { backgroundColor: '#e53935', color: '#fff', fontSize: '0.65rem', fontWeight: '800', padding: '1px 6px', borderRadius: '999px' };
const bookCardStyle = { backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 2px 14px rgba(0,0,0,0.06)', padding: '18px', overflow: 'hidden' };
const thumbStyle = { width: '56px', height: '78px', objectFit: 'cover', borderRadius: '8px', boxShadow: '0 3px 10px rgba(0,0,0,0.13)', flexShrink: 0 };
const thumbPlaceholderStyle = { width: '56px', height: '78px', backgroundColor: '#f5f5f5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', flexShrink: 0 };
const bookTitleStyle = { fontSize: '0.95rem', fontWeight: '700', margin: '0 0 4px', color: '#1a1a1a', lineHeight: 1.3 };
const bookAuthorStyle = { fontSize: '0.8rem', color: '#aaa', margin: '0 0 10px' };
const lenderBtnStyle = { padding: '6px 14px', borderRadius: '20px', border: '1px solid #1a1a1a', background: '#fff', color: '#1a1a1a', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' };
const acceptedBoxStyle = { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px', fontSize: '0.83rem', color: '#15803d', lineHeight: 1.7 };
const pendingBoxStyle = { backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 12px', fontSize: '0.83rem', color: '#92400e', lineHeight: 1.6 };
const acceptBtnStyle = { padding: '7px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer' };
const declineBtnStyle = { padding: '7px 16px', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: '#fff', color: '#888', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer' };
const pendingTagStyle = { fontSize: '0.78rem', backgroundColor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', padding: '3px 10px', borderRadius: '8px', fontWeight: '600' };
const cancelConfirmStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap',
    backgroundColor: '#fff5f5', border: '1px solid #fecaca', borderRadius: '10px',
    padding: '8px 12px', fontSize: '0.82rem', color: '#444'
};
const smKeepBtnStyle = { padding: '4px 10px', borderRadius: '6px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600' };
const smCancelActBtnStyle = { padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '700' };
const emptyStyle = { textAlign: 'center', color: '#ccc', padding: '40px', fontSize: '0.95rem' };
const emptyBoxStyle = { textAlign: 'center', padding: '60px 20px', backgroundColor: '#fafafa', borderRadius: '16px' };
const successBannerStyle = { backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px 16px', color: '#15803d', fontSize: '0.88rem', fontWeight: '600', marginBottom: '20px' };
const confirmBannerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', backgroundColor: '#fff5f5', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', flexWrap: 'wrap' };
const smCancelStyle = { padding: '5px 12px', borderRadius: '7px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600' };
const smDeleteStyle = { padding: '5px 12px', borderRadius: '7px', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '700' };
const addBtnStyle = { padding: '10px 20px', borderRadius: '12px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', fontWeight: '700', fontSize: '0.88rem', textDecoration: 'none', display: 'inline-block' };
const overlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' };
const modalStyle = { backgroundColor: '#fff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' };
const cancelBtnStyle = { flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #ddd', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '600' };
const saveBtnStyle = { flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '600' };

export default WishlistPage;
