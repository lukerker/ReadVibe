import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, db, signOut } from '../service/firebase';

const Navbar = ({ user }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [displayName, setDisplayName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    const [pendingRequests, setPendingRequests] = useState(0);
    const menuRef = useRef(null);

    // 載入使用者暱稱和頭貼
    useEffect(() => {
        if (!user) return;
        const unsub = db.collection('users').doc(user.uid).onSnapshot(doc => {
            if (doc.exists) {
                setDisplayName(doc.data().displayName || '');
                setAvatarUrl(doc.data().avatarUrl || '');
            }
        });
        return () => unsub();
    }, [user]);

    // 載入待處理借閱請求數
    useEffect(() => {
        if (!user) return;
        const unsub = db.collection('lendRequests')
            .where('ownerId', '==', user.uid)
            .where('status', '==', 'pending')
            .onSnapshot(snap => setPendingRequests(snap.size));
        return () => unsub();
    }, [user]);

    // 點選選單外部關閉
    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login');
    };

    const isActive = (path) =>
        path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

    const linkStyle = (path) => ({
        textDecoration: 'none',
        color: isActive(path) ? '#1a1a1a' : '#888',
        fontSize: '0.9rem',
        fontWeight: isActive(path) ? '700' : '500',
        paddingBottom: '2px',
        borderBottom: isActive(path) ? '2px solid #1a1a1a' : '2px solid transparent',
    });

    const initial = (displayName || user?.email || '?')[0].toUpperCase();

    return (
        <nav style={navStyle}>
            <div style={logoStyle}>
                <Link to="/" style={{ textDecoration: 'none', color: '#1a1a1a', fontWeight: '800' }}>
                    📚 ReadVibe
                </Link>
            </div>

            <ul style={linkListStyle}>
                <li><Link to="/" style={linkStyle('/')}>動態牆</Link></li>
                <li><Link to="/search" style={linkStyle('/search')}>找新書</Link></li>
                <li><Link to="/friends" style={linkStyle('/friends')}>好友</Link></li>
                <li><Link to={`/profile/${user?.uid}`} style={linkStyle('/profile')}>我的書架</Link></li>
                <li style={{ position: 'relative' }}>
                    <Link to="/wishlist" style={linkStyle('/wishlist')}>願望清單</Link>
                    {pendingRequests > 0 && (
                        <span style={{
                            position: 'absolute', top: '-6px', right: '-10px',
                            backgroundColor: '#e53935', color: '#fff',
                            fontSize: '0.6rem', fontWeight: '800',
                            width: '16px', height: '16px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{pendingRequests}</span>
                    )}
                </li>
            </ul>

            {/* 右側：暱稱 + 齒輪選單 */}
            <div style={rightAreaStyle} ref={menuRef}>
                <span style={nameStyle}>{displayName || user?.email?.split('@')[0] || '使用者'}</span>
                <button
                    onClick={() => setShowMenu(v => !v)}
                    style={gearBtnStyle}
                    title="設定"
                >
                    {/* 頭貼 or 首字母 */}
                    {avatarUrl
                        ? <img src={avatarUrl} alt="avatar" style={avatarImgStyle} />
                        : <div style={avatarInitialStyle}>{initial}</div>
                    }
                    <span style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '0px' }}>▼</span>
                </button>

                {showMenu && (
                    <div style={dropdownStyle}>
                        <Link
                            to="/settings"
                            style={dropdownItemStyle}
                            onClick={() => setShowMenu(false)}
                        >
                            ⚙️ 個人設定
                        </Link>
                        <div style={dropdownDividerStyle} />
                        <button onClick={handleLogout} style={dropdownLogoutStyle}>
                            🚪 登出
                        </button>
                    </div>
                )}
            </div>
        </nav>
    );
};

const navStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.85rem 2rem', backgroundColor: '#fff',
    borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, zIndex: 1000,
    boxShadow: '0 1px 12px rgba(0,0,0,0.05)'
};
const logoStyle = { fontSize: '1.1rem' };
const linkListStyle = {
    display: 'flex', listStyle: 'none', gap: '28px', margin: 0, padding: 0, alignItems: 'center'
};
const rightAreaStyle = { display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' };
const nameStyle = { fontSize: '0.88rem', fontWeight: '600', color: '#444' };
const gearBtnStyle = {
    display: 'flex', alignItems: 'center', gap: '6px',
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px'
};
const avatarImgStyle = {
    width: '34px', height: '34px', borderRadius: '50%',
    objectFit: 'cover', boxShadow: '0 1px 4px rgba(0,0,0,0.15)'
};
const avatarInitialStyle = {
    width: '34px', height: '34px', borderRadius: '50%',
    backgroundColor: '#1a1a1a', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: '800', fontSize: '0.9rem'
};
const dropdownStyle = {
    position: 'absolute', top: 'calc(100% + 10px)', right: 0,
    backgroundColor: '#fff', borderRadius: '14px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.14)', minWidth: '160px',
    overflow: 'hidden', zIndex: 9999
};
const dropdownItemStyle = {
    display: 'block', padding: '14px 18px',
    color: '#333', textDecoration: 'none',
    fontSize: '0.9rem', fontWeight: '600',
    transition: 'background 0.1s'
};
const dropdownDividerStyle = { height: '1px', backgroundColor: '#f5f5f5' };
const dropdownLogoutStyle = {
    display: 'block', width: '100%', padding: '14px 18px',
    color: '#e53935', textDecoration: 'none',
    fontSize: '0.9rem', fontWeight: '600', background: 'none', border: 'none',
    textAlign: 'left', cursor: 'pointer'
};

export default Navbar;