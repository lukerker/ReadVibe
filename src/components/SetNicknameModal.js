import React, { useState } from 'react';
import { db, auth } from '../service/firebase';

/**
 * Shown to brand-new users who have no displayName set.
 * Cannot be dismissed — must enter a nickname to proceed.
 */
const SetNicknameModal = ({ onDone }) => {
    const [nickname, setNickname] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async (e) => {
        e.preventDefault();
        const name = nickname.trim();
        if (name.length < 2) {
            setError('暱稱至少需要 2 個字');
            return;
        }
        if (name.length > 20) {
            setError('暱稱最多 20 個字');
            return;
        }
        setSaving(true);
        try {
            const uid = auth.currentUser?.uid;
            if (!uid) throw new Error('未登入');
            await db.collection('users').doc(uid).set({
                displayName: name,
                email: auth.currentUser.email || '',
                avatarUrl: '',
                bio: '',
                createdAt: new Date(),
            }, { merge: true });
            onDone();
        } catch (err) {
            setError('儲存失敗：' + err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={overlayStyle}>
            <div style={cardStyle}>
                {/* Decorative top */}
                <div style={topBarStyle} />

                <div style={{ padding: '32px 32px 28px' }}>
                    <h2 style={titleStyle}>👋 歡迎來到 ReadVibe！</h2>
                    <p style={subtitleStyle}>
                        在繼續之前，先幫自己取一個暱稱吧。<br />
                        這是其他書友認識你的方式。
                    </p>

                    <form onSubmit={handleSave} style={{ marginTop: '24px' }}>
                        <div style={inputWrapStyle}>
                            <input
                                type="text"
                                placeholder="你的暱稱…"
                                value={nickname}
                                onChange={e => { setNickname(e.target.value); setError(''); }}
                                style={inputStyle}
                                maxLength={20}
                                autoFocus
                            />
                            <span style={charCountStyle}>{nickname.length}/20</span>
                        </div>

                        {error && <p style={errorStyle}>{error}</p>}

                        <button
                            type="submit"
                            disabled={saving || nickname.trim().length < 2}
                            style={nickname.trim().length >= 2 ? btnStyle : btnDisabledStyle}
                        >
                            {saving ? '設定中…' : '確認並繼續 →'}
                        </button>
                    </form>

                    <p style={hintStyle}>* 之後可以在「個人設定」中更改暱稱</p>
                </div>
            </div>
        </div>
    );
};

// ── Styles ────────────────────────────────────────────────────────
const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 99999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px', backdropFilter: 'blur(4px)',
};
const cardStyle = {
    backgroundColor: '#fff', borderRadius: '24px',
    width: '100%', maxWidth: '420px',
    boxShadow: '0 32px 80px rgba(0,0,0,0.3)',
    overflow: 'hidden', fontFamily: '"Inter", -apple-system, sans-serif',
};
const topBarStyle = {
    height: '6px',
    background: 'linear-gradient(90deg, #1a1a1a 0%, #555 100%)',
};
const titleStyle = {
    fontSize: '1.5rem', fontWeight: '800', margin: '0 0 10px 0', color: '#1a1a1a',
};
const subtitleStyle = {
    fontSize: '0.9rem', color: '#666', lineHeight: 1.6, margin: 0,
};
const inputWrapStyle = {
    position: 'relative', marginBottom: '8px',
};
const inputStyle = {
    width: '100%', padding: '14px 50px 14px 16px',
    borderRadius: '14px', border: '2px solid #e0e0e0',
    fontSize: '1rem', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', transition: 'border-color 0.2s',
};
const charCountStyle = {
    position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
    fontSize: '0.75rem', color: '#bbb',
};
const errorStyle = {
    color: '#dc2626', fontSize: '0.82rem', margin: '0 0 12px 0',
};
const btnStyle = {
    width: '100%', padding: '14px', borderRadius: '14px',
    border: 'none', backgroundColor: '#1a1a1a', color: '#fff',
    fontSize: '1rem', fontWeight: '700', cursor: 'pointer', marginTop: '12px',
    transition: 'opacity 0.2s',
};
const btnDisabledStyle = {
    ...btnStyle, backgroundColor: '#e0e0e0', color: '#aaa', cursor: 'not-allowed',
};
const hintStyle = {
    fontSize: '0.75rem', color: '#bbb', marginTop: '16px', textAlign: 'center',
};

export default SetNicknameModal;
