import React, { useState, useEffect } from 'react';
import { auth, db, storage } from '../service/firebase';

const SettingPage = () => {
    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const fetchUserData = async () => {
            if (auth.currentUser) {
                const snap = await db.collection('users').doc(auth.currentUser.uid).get();
                if (snap.exists) {
                    const d = snap.data();
                    setDisplayName(d.displayName || '');
                    setBio(d.bio || '');
                    setAvatarUrl(d.avatarUrl || '');
                }
            }
            setFetching(false);
        };
        fetchUserData();
    }, []);

    const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    };

    const handleSave = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        let newAvatarUrl = avatarUrl;
        if (avatarFile) {
            try {
                const ref = storage.ref(`avatars/${auth.currentUser.uid}`);
                await ref.put(avatarFile);
                newAvatarUrl = await ref.getDownloadURL();
            } catch (e) {
                alert('頭貼上傳失敗：' + e.message);
                setLoading(false);
                return;
            }
        }
        await db.collection('users').doc(auth.currentUser.uid).set({
            displayName: displayName.trim(),
            bio: bio.trim(),
            email: auth.currentUser.email,
            avatarUrl: newAvatarUrl,
            updatedAt: new Date(),
        }, { merge: true });
        setAvatarUrl(newAvatarUrl);
        setAvatarFile(null);
        setAvatarPreview(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        setLoading(false);
    };

    if (fetching) return <div style={loadingStyle}>載入中…</div>;

    const displayAvatar = avatarPreview || avatarUrl;
    const initial = (displayName || auth.currentUser?.email || '?')[0].toUpperCase();

    return (
        <div style={pageStyle}>
            <h2 style={titleStyle}>⚙️ 個人設定</h2>

            {/* 大頭貼 */}
            <div style={avatarSectionStyle}>
                <label style={avatarLabelStyle} title="點擊更換頭貼">
                    {displayAvatar
                        ? <img src={displayAvatar} alt="avatar" style={avatarImgStyle} />
                        : <div style={avatarPlaceholderStyle}>{initial}</div>
                    }
                    <div style={avatarOverlayStyle}>📷 更換</div>
                    <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
                </label>
                <p style={{ color: '#aaa', fontSize: '0.82rem', marginTop: '10px' }}>點擊頭貼更換照片</p>
            </div>

            {/* 暱稱 */}
            <div style={fieldStyle}>
                <label style={labelStyle}>暱稱</label>
                <input
                    type="text"
                    placeholder="輸入你的暱稱"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    style={inputStyle}
                />
            </div>

            {/* 自我介紹 */}
            <div style={fieldStyle}>
                <label style={labelStyle}>自我介紹</label>
                <textarea
                    placeholder="簡短介紹自己，例如喜歡的書種或閱讀習慣…"
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    style={{ ...inputStyle, height: '100px', resize: 'none' }}
                />
            </div>

            {/* Email 唯讀 */}
            <div style={fieldStyle}>
                <label style={labelStyle}>電子郵件（無法更改）</label>
                <input type="email" value={auth.currentUser?.email || ''} readOnly style={{ ...inputStyle, color: '#aaa', backgroundColor: '#fafafa' }} />
            </div>

            <button onClick={handleSave} disabled={loading} style={saveBtnStyle}>
                {loading ? '儲存中…' : saved ? '✓ 已儲存！' : '儲存設定'}
            </button>
        </div>
    );
};

const pageStyle = { maxWidth: '480px', margin: '0 auto', padding: '40px 20px', fontFamily: '"Inter", -apple-system, sans-serif' };
const titleStyle = { fontSize: '1.6rem', fontWeight: '800', margin: '0 0 32px 0' };
const avatarSectionStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' };
const avatarLabelStyle = { position: 'relative', cursor: 'pointer', display: 'inline-block' };
const avatarImgStyle = { width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'block' };
const avatarPlaceholderStyle = {
    width: '96px', height: '96px', borderRadius: '50%',
    backgroundColor: '#1a1a1a', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: '800', fontSize: '2rem'
};
const avatarOverlayStyle = {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: '0 0 50px 50px',
    color: '#fff', fontSize: '0.7rem', fontWeight: '700', textAlign: 'center',
    padding: '4px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center'
};
const fieldStyle = { marginBottom: '22px' };
const labelStyle = { display: 'block', fontSize: '0.82rem', fontWeight: '700', marginBottom: '8px', color: '#555' };
const inputStyle = { width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #eee', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' };
const saveBtnStyle = { width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', fontSize: '1rem', fontWeight: '700', cursor: 'pointer', marginTop: '8px' };
const loadingStyle = { textAlign: 'center', padding: '100px', color: '#aaa', fontFamily: 'sans-serif' };

export default SettingPage;