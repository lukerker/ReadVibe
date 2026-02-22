import React, { useState, useEffect } from 'react';
import { auth, db, storage, arrayUnion, arrayRemove, increment } from '../service/firebase';

// ── Helpers ───────────────────────────────────────────────────────
const getDisplayName = (uid, stored, userMap) => {
    const current = userMap[uid]?.displayName;
    if (current && current.trim()) return current;
    if (stored && stored.trim() && !stored.includes('@')) return stored;
    if (stored && stored.includes('@')) return stored.split('@')[0];
    return uid ? uid.slice(0, 6) : '用戶';
};
const getAvatar = (uid, stored, userMap) => userMap[uid]?.avatarUrl || stored || '';

// ── Reusable Avatar ───────────────────────────────────────────────
const Avatar = ({ url, name, size = 40, style: extra = {} }) => (
    url
        ? <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.12)', ...extra }} />
        : <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: '#1a1a1a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: size * 0.38, flexShrink: 0, ...extra }}>
            {(name || '?')[0].toUpperCase()}
        </div>
);

// ── Comment Modal ─────────────────────────────────────────────────
const CommentModal = ({ moment, onClose, userMap }) => {
    const [comments, setComments] = useState([]);
    const [commentUserMap, setCommentUserMap] = useState({});
    const [text, setText] = useState('');
    const [posting, setPosting] = useState(false);
    const [openMenu, setOpenMenu] = useState(null);

    useEffect(() => {
        const unsub = db.collection('moments').doc(moment.id)
            .collection('comments')
            .orderBy('createdAt', 'asc')
            .onSnapshot(snap => setComments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsub();
    }, [moment.id]);

    // 即時載入留言者最新個人資料（解決舊名字問題）
    useEffect(() => {
        if (comments.length === 0) return;
        const uids = [...new Set(comments.map(c => c.userId).filter(Boolean))];
        Promise.all(uids.map(uid => db.collection('users').doc(uid).get())).then(docs => {
            const m = {};
            docs.forEach(d => { if (d.exists) m[d.id] = d.data(); });
            setCommentUserMap(m);
        });
    }, [comments]);

    const postComment = async () => {
        if (!text.trim() || !auth.currentUser || posting) return;
        setPosting(true);
        const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
        const ud = userDoc.exists ? userDoc.data() : {};
        const name = ud.displayName || auth.currentUser.email.split('@')[0];
        const batch = db.batch();
        const commentRef = db.collection('moments').doc(moment.id).collection('comments').doc();
        batch.set(commentRef, {
            userId: auth.currentUser.uid,
            displayName: name,
            avatarUrl: ud.avatarUrl || '',
            content: text.trim(),
            createdAt: new Date(),
        });
        batch.update(db.collection('moments').doc(moment.id), { commentCount: increment(1) });
        await batch.commit();
        setText('');
        setPosting(false);
    };

    const deleteComment = async (commentId) => {
        if (!auth.currentUser) return;
        const batch = db.batch();
        batch.delete(db.collection('moments').doc(moment.id).collection('comments').doc(commentId));
        batch.update(db.collection('moments').doc(moment.id), { commentCount: increment(-1) });
        await batch.commit();
        setOpenMenu(null);
    };

    const fmt = (ts) => ts?.toDate ? ts.toDate().toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    return (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={commentModalStyle}>
                <div style={cmHeaderStyle}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700' }}>💬 留言</h3>
                    <button onClick={onClose} style={closeStyle}>✕</button>
                </div>
                {/* 原貼文摘要 */}
                <div style={momentSummaryStyle}>
                    <Avatar url={getAvatar(moment.userId, moment.avatarUrl, userMap)} name={getDisplayName(moment.userId, moment.displayName, userMap)} size={36} />
                    <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: '700', fontSize: '0.88rem' }}>{getDisplayName(moment.userId, moment.displayName, userMap)}</span>
                        <span style={{ color: '#aaa', fontSize: '0.75rem', marginLeft: '8px' }}>{fmt(moment.createdAt)}</span>
                        <p style={{ margin: '6px 0 0 0', fontSize: '0.88rem', color: '#555', lineHeight: 1.5 }}>{moment.content}</p>
                        {moment.imageUrl && <img src={moment.imageUrl} alt="moment" style={{ width: '100%', borderRadius: '8px', marginTop: '8px', maxHeight: '180px', objectFit: 'cover' }} />}
                    </div>
                </div>
                <div style={{ height: '1px', backgroundColor: '#f0f0f0', margin: '0 0 8px 0' }} />

                {/* 留言列表 */}
                <div style={commentsListStyle}>
                    {comments.length === 0 && <p style={{ textAlign: 'center', color: '#ccc', fontSize: '0.85rem', padding: '20px' }}>還沒有留言，來第一個留言吧！</p>}
                    {comments.map(c => {
                        // Support both FeedPage schema (displayName/userId) and old ProfilePage schema (authorName/authorId)
                        const cName = c.displayName?.trim() || c.authorName?.trim() || getDisplayName(c.userId || c.authorId, '', commentUserMap);
                        const cAvatar = getAvatar(c.userId || c.authorId, c.avatarUrl, commentUserMap);
                        const isOwn = auth.currentUser?.uid === (c.userId || c.authorId);
                        return (
                            <div key={c.id} style={commentItemStyle}>
                                <Avatar url={cAvatar} name={cName} size={30} />
                                <div style={{ ...commentBubbleStyle, flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={commentNameStyle}>{cName}</span>
                                        {isOwn && (
                                            <div style={{ position: 'relative' }}>
                                                <button onClick={() => setOpenMenu(openMenu === c.id ? null : c.id)} style={feedDeleteBtnStyle}>⋯</button>
                                                {openMenu === c.id && (
                                                    <div style={feedMenuStyle}>
                                                        <button onClick={() => deleteComment(c.id)} style={feedMenuItemStyle}>🗑️ 刪除留言</button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <p style={{ margin: '3px 0 0 0', fontSize: '0.88rem', color: '#333', lineHeight: 1.5 }}>{c.content}</p>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: '#ccc' }}>{fmt(c.createdAt)}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 留言輸入 */}
                <div style={commentInputAreaStyle}>
                    <Avatar url={getAvatar(auth.currentUser?.uid, '', userMap)} name={getDisplayName(auth.currentUser?.uid, '', userMap)} size={30} />
                    <input placeholder="留言…" value={text} onChange={e => setText(e.target.value)}
                        style={commentInputStyle} />
                    <button onClick={postComment} disabled={!text.trim() || posting} style={commentSendStyle}>送出</button>
                </div>
            </div>
        </div>
    );
};

// ── New Moment Modal ──────────────────────────────────────────────
const NewMomentModal = ({ onClose }) => {
    const [myBooks, setMyBooks] = useState([]);
    const [selectedBook, setSelectedBook] = useState(null);
    const [content, setContent] = useState('');
    const [pageNum, setPageNum] = useState(0);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (!auth.currentUser) return;
        db.collection('users').doc(auth.currentUser.uid).collection('books')
            .orderBy('addedAt', 'desc').get()
            .then(snap => setMyBooks(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, []);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const handlePost = async () => {
        if (!content.trim() || !auth.currentUser) return;
        setUploading(true);
        const uid = auth.currentUser.uid;
        const userDoc = await db.collection('users').doc(uid).get();
        const ud = userDoc.exists ? userDoc.data() : {};
        const name = ud.displayName || auth.currentUser.email.split('@')[0];
        let imageUrl = '';
        if (imageFile) {
            try {
                const ref = storage.ref(`moment-images/${Date.now()}_${imageFile.name}`);
                await ref.put(imageFile);
                imageUrl = await ref.getDownloadURL();
            } catch (e) { console.error('圖片上傳失敗：', e); }
        }
        await db.collection('moments').add({
            userId: uid, displayName: name, avatarUrl: ud.avatarUrl || '',
            bookId: selectedBook?.id || '', bookTitle: selectedBook?.title || '',
            bookThumbnail: selectedBook?.thumbnail || '', bookAuthor: selectedBook?.author || '',
            content: content.trim(), pageNumber: pageNum,
            imageUrl, likedBy: [], commentCount: 0, createdAt: new Date(),
        });
        if (selectedBook && pageNum > 0) {
            await db.collection('users').doc(uid).collection('books')
                .doc(selectedBook.id).update({ currentPage: pageNum });
        }
        setUploading(false);
        onClose();
    };

    return (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={modalStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontWeight: '800' }}>✨ 發表讀書感想</h3>
                    <button onClick={onClose} style={closeStyle}>✕</button>
                </div>
                <label style={labelStyle}>選擇書籍（選填）</label>
                <select value={selectedBook?.id || ''} onChange={e => {
                    const b = myBooks.find(b => b.id === e.target.value);
                    setSelectedBook(b || null);
                    if (b) setPageNum(b.currentPage || 0);
                }} style={{ ...inputStyle, marginBottom: '16px' }}>
                    <option value="">不選書</option>
                    {myBooks.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                </select>
                {selectedBook && (
                    <>
                        <label style={labelStyle}>目前頁數</label>
                        <input type="number" min="0" value={pageNum}
                            onChange={e => setPageNum(Number(e.target.value))}
                            style={{ ...inputStyle, marginBottom: '16px' }} />
                    </>
                )}
                <label style={labelStyle}>感想 / 摘錄</label>
                <textarea placeholder="今天讀到哪裡有感想…" value={content}
                    onChange={e => setContent(e.target.value)}
                    style={{ ...inputStyle, height: '110px', resize: 'none', marginBottom: '16px' }} />
                <label style={labelStyle}>附上照片（選填）</label>
                <label style={photoPickerStyle}>
                    {imagePreview
                        ? <img src={imagePreview} alt="preview" style={imagePreviewStyle} />
                        : <span style={{ color: '#aaa', fontSize: '0.88rem' }}>📷 點此選擇圖片</span>}
                    <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                </label>
                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                    <button onClick={onClose} style={cancelBtnStyle}>取消</button>
                    <button onClick={handlePost} disabled={!content.trim() || uploading} style={saveBtnStyle}>
                        {uploading ? '上傳中…' : '發表'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Moment Card ───────────────────────────────────────────────────
const MomentCard = ({ moment, onOpenComments, userMap }) => {
    const uid = auth.currentUser?.uid;
    const isOwn = uid === moment.userId;
    const isLiked = moment.likedBy?.includes(uid);
    const likeCount = moment.likedBy?.length || 0;
    const [commentCount, setCommentCount] = useState(moment.commentCount || 0);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const name = getDisplayName(moment.userId, moment.displayName, userMap);
    const avatar = getAvatar(moment.userId, moment.avatarUrl, userMap);

    // Real-time comment count from subcollection
    useEffect(() => {
        const unsub = db.collection('moments').doc(moment.id).collection('comments')
            .onSnapshot(snap => setCommentCount(snap.size));
        return () => unsub();
    }, [moment.id]);

    const toggleLike = () => uid && db.collection('moments').doc(moment.id).update({
        likedBy: isLiked ? arrayRemove(uid) : arrayUnion(uid)
    });

    const deleteMoment = async () => {
        try {
            // delete subcollections (likes + comments)
            const [likesSnap, commentsSnap] = await Promise.all([
                db.collection('moments').doc(moment.id).collection('likes').get(),
                db.collection('moments').doc(moment.id).collection('comments').get(),
            ]);
            const batch = db.batch();
            likesSnap.docs.forEach(d => batch.delete(d.ref));
            commentsSnap.docs.forEach(d => batch.delete(d.ref));
            batch.delete(db.collection('moments').doc(moment.id));
            await batch.commit();
        } catch (e) { alert('刪除失敗：' + e.message); }
        setShowDeleteConfirm(false);
    };

    const fmt = (ts) => ts?.toDate ? ts.toDate().toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    return (
        <div style={cardStyle}>
            {/* 刪除確認 */}
            {showDeleteConfirm && (
                <div style={confirmBannerStyle}>
                    <span style={{ fontSize: '0.88rem', color: '#444' }}>確定要刪除這則感想？</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setShowDeleteConfirm(false)} style={confirmCancelStyle}>取消</button>
                        <button onClick={deleteMoment} style={confirmDeleteStyle}>刪除</button>
                    </div>
                </div>
            )}
            {/* 用戶列 */}
            <div style={cardHeaderStyle}>
                <Avatar url={avatar} name={name} size={42} />
                <div style={{ flex: 1 }}>
                    <span style={cardUserNameStyle}>{name}</span>
                    <span style={cardTimeStyle}>{fmt(moment.createdAt)}</span>
                </div>
                {isOwn && (
                    <button onClick={() => setShowDeleteConfirm(v => !v)} style={feedDeleteBtnStyle} title="刪除感想">⋯</button>
                )}
            </div>
            {/* 書名標籤（獨立一行，完整顯示） */}
            {moment.bookTitle && (
                <div style={bookBadgeStyle}>
                    {moment.bookThumbnail && <img src={moment.bookThumbnail} alt={moment.bookTitle} style={{ width: '18px', height: '25px', objectFit: 'cover', borderRadius: '3px', flexShrink: 0 }} />}
                    <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#444', lineHeight: 1.3 }}>
                        {moment.bookTitle}
                    </span>
                    {moment.pageNumber > 0 && <span style={pageBadgeStyle}>第{moment.pageNumber}頁</span>}
                </div>
            )}
            <p style={cardContentStyle}>{moment.content}</p>
            {moment.imageUrl && <img src={moment.imageUrl} alt="moment" style={momentImageStyle} />}
            <div style={actionsStyle}>
                <button onClick={toggleLike} style={{ ...actionBtnStyle, color: isLiked ? '#e53935' : '#bbb' }}>
                    {isLiked ? '❤️' : '🤍'}{likeCount > 0 && <span style={{ fontSize: '0.82rem', marginLeft: '4px' }}>{likeCount}</span>}
                </button>
                <button onClick={() => onOpenComments(moment)} style={{ ...actionBtnStyle, color: '#bbb' }}>
                    💬{commentCount > 0 && <span style={{ fontSize: '0.82rem', marginLeft: '4px' }}>{commentCount}</span>}
                </button>
            </div>
        </div>
    );
};

// ── Main FeedPage ─────────────────────────────────────────────────
const FeedPage = () => {
    const [moments, setMoments] = useState([]);
    const [userMap, setUserMap] = useState({});
    const [showNewModal, setShowNewModal] = useState(false);
    const [commentMoment, setCommentMoment] = useState(null);

    useEffect(() => {
        const unsub = db.collection('moments').orderBy('createdAt', 'desc')
            .onSnapshot(snap => setMoments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsub();
    }, []);

    // 每次 moments 更新，重新載入所有作者的最新個人資料
    useEffect(() => {
        if (moments.length === 0) return;
        const uids = [...new Set(moments.map(m => m.userId).filter(Boolean))];
        Promise.all(uids.map(uid => db.collection('users').doc(uid).get())).then(docs => {
            const m = {};
            docs.forEach(d => { if (d.exists) m[d.id] = d.data(); });
            setUserMap(m);
        });
    }, [moments]);

    return (
        <div style={pageStyle}>
            {showNewModal && <NewMomentModal onClose={() => setShowNewModal(false)} />}
            {commentMoment && <CommentModal moment={commentMoment} onClose={() => setCommentMoment(null)} userMap={userMap} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '800' }}>動態牆</h2>
                    <p style={{ margin: '4px 0 0 0', color: '#aaa', fontSize: '0.88rem' }}>看看大家最近讀了什麼</p>
                </div>
                <button onClick={() => setShowNewModal(true)} style={postBtnStyle}>✨ 發表感想</button>
            </div>
            {moments.length === 0 && (
                <div style={emptyStyle}>
                    <p>動態牆還是空的～</p>
                    <p style={{ fontSize: '0.88rem', color: '#ccc' }}>點「✨ 發表感想」分享你的讀書心得！</p>
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {moments.map(m => <MomentCard key={m.id} moment={m} onOpenComments={setCommentMoment} userMap={userMap} />)}
            </div>
        </div>
    );
};

// ── Styles ────────────────────────────────────────────────────────
const pageStyle = { maxWidth: '680px', margin: '0 auto', padding: '32px 16px', fontFamily: '"Inter", -apple-system, sans-serif' };
const cardStyle = { backgroundColor: '#fff', borderRadius: '18px', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', padding: '20px', overflow: 'hidden' };
const cardHeaderStyle = { display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' };
const cardUserNameStyle = { fontWeight: '700', fontSize: '0.95rem', display: 'block', color: '#1a1a1a' };
const cardTimeStyle = { fontSize: '0.75rem', color: '#bbb', display: 'block', marginTop: '2px' };
const bookBadgeStyle = { display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#f5f5f5', padding: '6px 10px', borderRadius: '10px', marginBottom: '12px', flexWrap: 'wrap' };
const pageBadgeStyle = { fontSize: '0.72rem', backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '2px 6px', borderRadius: '5px', fontWeight: '700', flexShrink: 0 };
const confirmBannerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', backgroundColor: '#fff5f5', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', flexWrap: 'wrap' };
const confirmCancelStyle = { padding: '5px 14px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600' };
const confirmDeleteStyle = { padding: '5px 14px', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '700' };
const cardContentStyle = { fontSize: '0.95rem', color: '#333', lineHeight: 1.65, margin: '0 0 12px 0', whiteSpace: 'pre-wrap' };
const momentImageStyle = { width: '100%', maxHeight: '360px', objectFit: 'cover', borderRadius: '12px', marginBottom: '14px' };
const actionsStyle = { display: 'flex', gap: '8px', borderTop: '1px solid #f5f5f5', paddingTop: '12px', marginTop: '4px' };
const actionBtnStyle = { display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.05rem', padding: '6px 12px', borderRadius: '8px', fontWeight: '600' };
const postBtnStyle = { padding: '10px 20px', borderRadius: '12px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer' };
const emptyStyle = { textAlign: 'center', padding: '60px', color: '#bbb', fontSize: '1rem' };
const overlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalStyle = { backgroundColor: '#fff', borderRadius: '22px', padding: '28px', width: '90%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' };
const labelStyle = { display: 'block', fontSize: '0.82rem', fontWeight: '700', marginBottom: '6px', color: '#555' };
const inputStyle = { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1px solid #eee', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };
const cancelBtnStyle = { flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #ddd', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '600' };
const saveBtnStyle = { flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '600' };
const closeStyle = { background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#aaa', padding: '4px' };
const photoPickerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '90px', backgroundColor: '#f8f8f8', borderRadius: '12px', border: '2px dashed #e0e0e0', cursor: 'pointer', overflow: 'hidden', boxSizing: 'border-box' };
const imagePreviewStyle = { width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '10px' };
const commentModalStyle = { backgroundColor: '#fff', borderRadius: '22px', width: '90%', maxWidth: '500px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' };
const cmHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 20px 14px 20px' };
const momentSummaryStyle = { display: 'flex', gap: '12px', padding: '0 20px 14px 20px', alignItems: 'flex-start' };
const commentsListStyle = { flex: 1, overflowY: 'auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '60px', maxHeight: '300px' };
const commentItemStyle = { display: 'flex', gap: '8px', alignItems: 'flex-start' };
const commentBubbleStyle = { backgroundColor: '#f5f5f5', borderRadius: '12px', padding: '10px 14px', flex: 1 };
const commentNameStyle = { fontWeight: '700', fontSize: '0.82rem', color: '#1a1a1a' };
const commentInputAreaStyle = { display: 'flex', gap: '10px', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #f0f0f0', marginTop: '8px' };
const commentInputStyle = { flex: 1, padding: '10px 14px', borderRadius: '20px', border: '1px solid #eee', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' };
const commentSendStyle = { padding: '8px 16px', borderRadius: '20px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' };
const feedDeleteBtnStyle = { background: 'none', border: 'none', fontSize: '1.1rem', color: '#ccc', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 };
const feedMenuStyle = { position: 'absolute', right: 0, top: '100%', backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', padding: '4px', zIndex: 100, minWidth: '110px' };
const feedMenuItemStyle = { display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.83rem', color: '#dc2626', textAlign: 'left', borderRadius: '7px' };

export default FeedPage;
