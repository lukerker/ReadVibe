import React, { useState } from 'react';
import { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../service/firebase';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isRegister, setIsRegister] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (isRegister) {
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                // Create user doc with blank displayName → triggers nickname modal in app.js
                await db.collection('users').doc(cred.user.uid).set({
                    displayName: '',
                    email: email,
                    avatarUrl: '',
                    bio: '',
                    createdAt: new Date(),
                });
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (error) {
            alert('出錯了：' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={wrapperStyle}>
            <div style={cardStyle}>
                <div style={headerStyle}>
                    <h1 style={logoStyle}>ReadVibe</h1>
                    <p style={taglineStyle}>與好友共享閱讀的靈魂空間</p>
                </div>

                <form onSubmit={handleAuth} style={formStyle}>
                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>電子郵件</label>
                        <input
                            type="email"
                            placeholder="example@mail.com"
                            onChange={(e) => setEmail(e.target.value)}
                            style={inputStyle}
                            required
                        />
                    </div>

                    <div style={inputGroupStyle}>
                        <label style={labelStyle}>密碼</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            onChange={(e) => setPassword(e.target.value)}
                            style={inputStyle}
                            required
                        />
                    </div>

                    <button type="submit" style={buttonStyle} disabled={loading}>
                        {loading ? '處理中...' : (isRegister ? '立即註冊' : '登入系統')}
                    </button>
                </form>

                <div style={footerStyle}>
                    <button onClick={() => setIsRegister(!isRegister)} style={switchBtnStyle}>
                        {isRegister ? '已經有帳號？回登入頁' : '還沒有帳號？點此註冊'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- 介面美化樣式 (回歸帥氣版) ---
const wrapperStyle = {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    height: '100vh', backgroundColor: '#f8f9fa',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};
const cardStyle = {
    backgroundColor: '#fff', padding: '40px', borderRadius: '24px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.06)', width: '100%', maxWidth: '400px', textAlign: 'center'
};
const headerStyle = { marginBottom: '32px' };
const logoStyle = { fontSize: '2rem', fontWeight: '800', letterSpacing: '-1px', margin: '0 0 8px 0' };
const taglineStyle = { color: '#888', fontSize: '0.9rem' };
const formStyle = { display: 'flex', flexDirection: 'column', gap: '20px' };
const inputGroupStyle = { textAlign: 'left' };
const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' };
const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: '12px',
    border: '1px solid #e0e0e0', fontSize: '1rem', boxSizing: 'border-box', outline: 'none'
};
const buttonStyle = {
    width: '100%', padding: '14px', backgroundColor: '#1a1a1a', color: '#fff',
    border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer'
};
const footerStyle = { marginTop: '24px', borderTop: '1px solid #eee', paddingTop: '20px' };
const switchBtnStyle = { background: 'none', border: 'none', color: '#007aff', cursor: 'pointer', fontSize: '0.9rem' };

export default LoginPage;