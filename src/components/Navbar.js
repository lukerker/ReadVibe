import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { auth, db, signOut } from '../service/firebase';

const Navbar = ({ user }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [displayName, setDisplayName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [showMenu, setShowMenu] = useState(false);       // desktop dropdown
    const [showMobileNav, setShowMobileNav] = useState(false); // mobile hamburger
    const [pendingRequests, setPendingRequests] = useState(0);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
    const menuRef = useRef(null);

    // Track viewport width
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 700);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Load display name + avatar
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

    // Pending lend requests badge
    useEffect(() => {
        if (!user) return;
        const unsub = db.collection('lendRequests')
            .where('ownerId', '==', user.uid)
            .where('status', '==', 'pending')
            .onSnapshot(snap => setPendingRequests(snap.size));
        return () => unsub();
    }, [user]);

    // Close desktop dropdown when clicking outside
    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Close mobile nav on route change
    useEffect(() => { setShowMobileNav(false); }, [location]);

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

    const navLinks = [
        { to: '/', label: '動態牆' },
        { to: '/search', label: '找新書' },
        { to: '/friends', label: '好友' },
        { to: `/profile/${user?.uid}`, label: '我的書架', activePath: '/profile' },
        { to: '/wishlist', label: '願望清單', badge: pendingRequests },
    ];

    return (
        <>
            <nav style={navStyle}>
                {/* Logo */}
                <div style={logoStyle}>
                    <Link to="/" style={{ textDecoration: 'none', color: '#1a1a1a', fontWeight: '800' }}>
                        📚 ReadVibe
                    </Link>
                </div>

                {/* Desktop nav links */}
                {!isMobile && (
                    <ul style={linkListStyle}>
                        {navLinks.map(l => (
                            <li key={l.to} style={{ position: 'relative' }}>
                                <Link to={l.to} style={linkStyle(l.activePath || l.to)}>{l.label}</Link>
                                {l.badge > 0 && <span style={badgeDotStyle}>{l.badge}</span>}
                            </li>
                        ))}
                    </ul>
                )}

                {/* Right side: name + avatar dropdown + hamburger */}
                <div style={rightAreaStyle} ref={menuRef}>
                    {!isMobile && (
                        <span style={nameStyle}>{displayName || user?.email?.split('@')[0] || '使用者'}</span>
                    )}
                    <button onClick={() => setShowMenu(v => !v)} style={gearBtnStyle} title="設定">
                        {avatarUrl
                            ? <img src={avatarUrl} alt="avatar" style={avatarImgStyle} />
                            : <div style={avatarInitialStyle}>{initial}</div>
                        }
                        {!isMobile && <span style={{ fontSize: '0.7rem', color: '#aaa' }}>▼</span>}
                    </button>

                    {showMenu && (
                        <div style={dropdownStyle}>
                            <Link to="/settings" style={dropdownItemStyle} onClick={() => setShowMenu(false)}>
                                ⚙️ 個人設定
                            </Link>
                            <div style={dropdownDividerStyle} />
                            <button onClick={handleLogout} style={dropdownLogoutStyle}>
                                🚪 登出
                            </button>
                        </div>
                    )}

                    {/* Hamburger button (mobile only) */}
                    {isMobile && (
                        <button
                            onClick={() => setShowMobileNav(v => !v)}
                            style={hamburgerBtnStyle}
                            aria-label="選單"
                        >
                            {showMobileNav ? '✕' : '☰'}
                            {pendingRequests > 0 && !showMobileNav && (
                                <span style={hamburgerBadgeStyle}>{pendingRequests}</span>
                            )}
                        </button>
                    )}
                </div>
            </nav>

            {/* Mobile slide-down nav panel */}
            {isMobile && showMobileNav && (
                <div style={mobileNavPanelStyle}>
                    {navLinks.map(l => (
                        <Link
                            key={l.to}
                            to={l.to}
                            style={mobileLinkStyle(l.activePath || l.to, isActive)}
                        >
                            <span>{l.label}</span>
                            {l.badge > 0 && <span style={mobileBadgeStyle}>{l.badge}</span>}
                        </Link>
                    ))}
                    <div style={{ height: '1px', backgroundColor: '#f0f0f0', margin: '4px 0' }} />
                    <Link to="/settings" style={mobileLinkStyle('/settings', isActive)}>⚙️ 個人設定</Link>
                    <button onClick={handleLogout} style={mobileLogoutStyle}>🚪 登出</button>
                </div>
            )}
        </>
    );
};

// ── Styles ────────────────────────────────────────────────────────
const navStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.85rem 1.5rem', backgroundColor: '#fff',
    borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, zIndex: 1000,
    boxShadow: '0 1px 12px rgba(0,0,0,0.05)'
};
const logoStyle = { fontSize: '1.1rem', flexShrink: 0 };
const linkListStyle = {
    display: 'flex', listStyle: 'none', gap: '24px', margin: 0, padding: 0, alignItems: 'center'
};
const rightAreaStyle = { display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', flexShrink: 0 };
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
const badgeDotStyle = {
    position: 'absolute', top: '-6px', right: '-10px',
    backgroundColor: '#e53935', color: '#fff',
    fontSize: '0.6rem', fontWeight: '800',
    width: '16px', height: '16px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
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
};
const dropdownDividerStyle = { height: '1px', backgroundColor: '#f5f5f5' };
const dropdownLogoutStyle = {
    display: 'block', width: '100%', padding: '14px 18px',
    color: '#e53935', textDecoration: 'none',
    fontSize: '0.9rem', fontWeight: '600', background: 'none', border: 'none',
    textAlign: 'left', cursor: 'pointer'
};

// Mobile hamburger
const hamburgerBtnStyle = {
    background: 'none', border: 'none', fontSize: '1.3rem',
    cursor: 'pointer', color: '#1a1a1a', padding: '4px 8px',
    position: 'relative', lineHeight: 1
};
const hamburgerBadgeStyle = {
    position: 'absolute', top: '0px', right: '0px',
    backgroundColor: '#e53935', color: '#fff',
    fontSize: '0.55rem', fontWeight: '800',
    width: '14px', height: '14px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
};

// Mobile slide-down panel
const mobileNavPanelStyle = {
    position: 'sticky', top: '58px', zIndex: 999,
    backgroundColor: '#fff', borderBottom: '1px solid #f0f0f0',
    boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
    display: 'flex', flexDirection: 'column',
};
const mobileLinkStyle = (path, isActive) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 24px',
    textDecoration: 'none',
    color: isActive(path) ? '#1a1a1a' : '#555',
    fontWeight: isActive(path) ? '700' : '500',
    fontSize: '0.95rem',
    backgroundColor: isActive(path) ? '#f9f9f9' : 'transparent',
    borderLeft: isActive(path) ? '3px solid #1a1a1a' : '3px solid transparent',
});
const mobileBadgeStyle = {
    backgroundColor: '#e53935', color: '#fff',
    fontSize: '0.65rem', fontWeight: '800',
    padding: '2px 7px', borderRadius: '999px',
};
const mobileLogoutStyle = {
    display: 'block', width: '100%', padding: '14px 24px',
    color: '#e53935', fontSize: '0.95rem', fontWeight: '600',
    background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
};

export default Navbar;