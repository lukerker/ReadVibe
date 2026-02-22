import React, { useState, useEffect } from 'react';
import { auth, db } from '../service/firebase';

const DIMENSIONS = ['含金量', '邏輯力', '啟發性', '共鳴度', '易讀性'];

// ── SVG Radar Chart ─────────────────────────────────────────────────
const RadarChart = ({ data, size = 220 }) => {
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.36;
    const levels = 5;
    const n = DIMENSIONS.length;

    const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;

    const polarToXY = (i, dist) => ({
        x: cx + dist * Math.cos(angle(i)),
        y: cy + dist * Math.sin(angle(i)),
    });

    // Background grid rings
    const gridRings = Array.from({ length: levels }, (_, li) => {
        const frac = (li + 1) / levels;
        const pts = Array.from({ length: n }, (_, i) => {
            const p = polarToXY(i, r * frac);
            return `${p.x},${p.y}`;
        }).join(' ');
        return (
            <polygon
                key={li}
                points={pts}
                fill={li % 2 === 0 ? '#f9f9f9' : '#f0f0f0'}
                stroke="#e8e8e8"
                strokeWidth="1"
            />
        );
    });

    // Grid spokes
    const spokes = Array.from({ length: n }, (_, i) => {
        const outer = polarToXY(i, r);
        return (
            <line
                key={i}
                x1={cx} y1={cy}
                x2={outer.x} y2={outer.y}
                stroke="#e0e0e0"
                strokeWidth="1"
            />
        );
    });

    // Data polygon
    const dataPoints = DIMENSIONS.map((dim, i) => {
        const val = data[dim] || 0;
        const frac = (val / 5) * r;
        return polarToXY(i, frac);
    });
    const dataPath = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

    // Labels
    const labels = DIMENSIONS.map((dim, i) => {
        const labelDist = r + 22;
        const p = polarToXY(i, labelDist);
        return (
            <text
                key={dim}
                x={p.x} y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="11"
                fontWeight="700"
                fill="#555"
                fontFamily='"Inter", -apple-system, sans-serif'
            >
                {dim}
            </text>
        );
    });

    // Score dots
    const dots = dataPoints.map((p, i) => {
        const val = data[DIMENSIONS[i]] || 0;
        if (!val) return null;
        return <circle key={i} cx={p.x} cy={p.y} r="4" fill="#1a1a1a" />;
    });

    return (
        <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
            {gridRings}
            {spokes}
            {dataPath && (
                <polygon
                    points={dataPath}
                    fill="rgba(26,26,26,0.12)"
                    stroke="#1a1a1a"
                    strokeWidth="2"
                    strokeLinejoin="round"
                />
            )}
            {dots}
            {labels}
        </svg>
    );
};

// ── Star Picker ──────────────────────────────────────────────────────
const StarPicker = ({ value, onChange, readOnly = false, size = 22 }) => {
    const [hover, setHover] = useState(0);
    return (
        <span style={{ display: 'inline-flex', gap: '2px' }}>
            {[1, 2, 3, 4, 5].map((s) => (
                <span
                    key={s}
                    style={{
                        fontSize: size,
                        cursor: readOnly ? 'default' : 'pointer',
                        color: (readOnly ? value : (hover || value)) >= s ? '#f59e0b' : '#e0e0e0',
                        transition: 'color 0.1s',
                        lineHeight: 1,
                    }}
                    onMouseEnter={() => !readOnly && setHover(s)}
                    onMouseLeave={() => !readOnly && setHover(0)}
                    onClick={() => !readOnly && onChange && onChange(s)}
                >
                    ★
                </span>
            ))}
        </span>
    );
};

// ── Helpers ──────────────────────────────────────────────────────────
const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

const calcCommunityAvg = (ratingsArr) => {
    if (!ratingsArr.length) return { overall: 0, ...Object.fromEntries(DIMENSIONS.map(d => [d, 0])) };
    const result = {};
    ['overall', ...DIMENSIONS].forEach(key => {
        result[key] = avg(ratingsArr.map(r => r[key] || 0).filter(v => v > 0));
    });
    return result;
};

// ── Main Modal ───────────────────────────────────────────────────────
const BookRatingModal = ({ bookId, bookTitle, bookThumbnail, canRate = false, onClose }) => {
    const [myRating, setMyRating] = useState({ overall: 0, ...Object.fromEntries(DIMENSIONS.map(d => [d, 0])) });
    const [communityRatings, setCommunityRatings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [tab, setTab] = useState(canRate ? 'mine' : 'community');

    const uid = auth.currentUser?.uid;

    // Load all ratings for this book
    useEffect(() => {
        if (!bookId) return;
        const unsub = db.collection('bookRatings').doc(bookId).collection('ratings')
            .onSnapshot(snap => {
                const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setCommunityRatings(all);
                if (uid) {
                    const mine = all.find(r => r.id === uid);
                    if (mine) {
                        setMyRating({
                            overall: mine.overall || 0,
                            ...Object.fromEntries(DIMENSIONS.map(d => [d, mine[d] || 0])),
                        });
                    }
                }
                setLoading(false);
            });
        return () => unsub();
    }, [bookId, uid]);

    const handleSave = async () => {
        if (!uid || !bookId) return;
        setSaving(true);
        try {
            await db.collection('bookRatings').doc(bookId).collection('ratings').doc(uid).set({
                overall: myRating.overall,
                ...Object.fromEntries(DIMENSIONS.map(d => [d, myRating[d]])),
                updatedAt: new Date(),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            alert('儲存失敗：' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const communityAvg = calcCommunityAvg(communityRatings);
    const raterCount = communityRatings.filter(r => r.overall > 0).length;

    return (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={modalStyle}>
                {/* Header */}
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                        {bookThumbnail && (
                            <img src={bookThumbnail} alt={bookTitle}
                                style={{ width: '36px', height: '50px', objectFit: 'cover', borderRadius: '5px', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.72rem', color: '#aaa', fontWeight: '600', marginBottom: '2px' }}>書籍評分</div>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {bookTitle}
                            </h3>
                        </div>
                    </div>
                    <button onClick={onClose} style={closeStyle}>✕</button>
                </div>

                {/* Tabs */}
                <div style={tabBarStyle}>
                    {canRate && (
                        <button onClick={() => setTab('mine')} style={tab === 'mine' ? activeTabStyle : tabStyle}>
                            ⭐ 我的評分
                        </button>
                    )}
                    <button onClick={() => setTab('community')} style={tab === 'community' ? activeTabStyle : tabStyle}>
                        👥 社群平均
                        {raterCount > 0 && <span style={raterBadgeStyle}>{raterCount}</span>}
                    </button>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '50px', color: '#bbb' }}>載入中…</div>
                ) : (
                    <>
                        {/* My Rating Tab */}
                        {tab === 'mine' && canRate && (
                            <div style={tabContentStyle}>
                                {/* Overall */}
                                <div style={overallRowStyle}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.78rem', color: '#888', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            綜合評分
                                        </div>
                                        <StarPicker value={myRating.overall} size={32}
                                            onChange={v => setMyRating(p => ({ ...p, overall: v }))} />
                                        <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#aaa' }}>
                                            {myRating.overall ? `${myRating.overall} / 5` : '點擊給分'}
                                        </div>
                                    </div>
                                </div>

                                {/* Dimensions */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                                    {DIMENSIONS.map(dim => (
                                        <div key={dim} style={dimRowStyle}>
                                            <span style={dimLabelStyle}>{dim}</span>
                                            <StarPicker value={myRating[dim]} size={20}
                                                onChange={v => setMyRating(p => ({ ...p, [dim]: v }))} />
                                            <span style={dimValueStyle}>
                                                {myRating[dim] ? myRating[dim] : '—'}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Radar preview */}
                                {DIMENSIONS.some(d => myRating[d] > 0) && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ fontSize: '0.78rem', color: '#aaa', fontWeight: '600', textAlign: 'center', marginBottom: '10px' }}>預覽雷達圖</div>
                                        <RadarChart data={myRating} />
                                    </div>
                                )}

                                <button
                                    onClick={handleSave}
                                    disabled={saving || !myRating.overall}
                                    style={!myRating.overall ? { ...saveBtnStyle, opacity: 0.4, cursor: 'not-allowed' } : saveBtnStyle}
                                >
                                    {saving ? '儲存中…' : saved ? '✓ 已儲存！' : '送出評分'}
                                </button>
                            </div>
                        )}

                        {/* Community Tab */}
                        {tab === 'community' && (
                            <div style={tabContentStyle}>
                                {raterCount === 0 ? (
                                    <div style={emptyStyle}>
                                        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📊</div>
                                        <div style={{ fontSize: '0.9rem', color: '#bbb' }}>還沒有人評分這本書</div>
                                        {canRate && <div style={{ fontSize: '0.8rem', color: '#ccc', marginTop: '6px' }}>成為第一個評分的人！</div>}
                                    </div>
                                ) : (
                                    <>
                                        {/* Overall community avg */}
                                        <div style={overallRowStyle}>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.78rem', color: '#888', fontWeight: '700', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    社群綜合評分
                                                </div>
                                                <StarPicker value={communityAvg.overall} size={28} readOnly />
                                                <div style={{ marginTop: '8px' }}>
                                                    <span style={{ fontSize: '1.6rem', fontWeight: '800', color: '#1a1a1a' }}>
                                                        {communityAvg.overall.toFixed(1)}
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', color: '#aaa', marginLeft: '4px' }}>/ 5</span>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#bbb', marginTop: '2px' }}>
                                                    共 {raterCount} 人評分
                                                </div>
                                            </div>
                                        </div>

                                        {/* Radar chart */}
                                        <div style={{ margin: '4px 0 20px' }}>
                                            <RadarChart data={communityAvg} />
                                        </div>

                                        {/* Dimension breakdown */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {DIMENSIONS.map(dim => {
                                                const val = communityAvg[dim];
                                                const pct = (val / 5) * 100;
                                                return (
                                                    <div key={dim}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                            <span style={dimLabelStyle}>{dim}</span>
                                                            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1a1a1a' }}>
                                                                {val > 0 ? val.toFixed(1) : '—'}
                                                            </span>
                                                        </div>
                                                        <div style={{ backgroundColor: '#f0f0f0', borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
                                                            <div style={{
                                                                backgroundColor: '#1a1a1a',
                                                                height: '100%',
                                                                width: `${pct}%`,
                                                                borderRadius: '999px',
                                                                transition: 'width 0.5s ease'
                                                            }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// ── Styles ───────────────────────────────────────────────────────────
const overlayStyle = {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
};
const modalStyle = {
    backgroundColor: '#fff', borderRadius: '22px',
    width: '100%', maxWidth: '420px', maxHeight: '90vh',
    overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
};
const headerStyle = {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '20px 20px 0 20px',
};
const closeStyle = {
    background: 'none', border: 'none', fontSize: '1.1rem',
    cursor: 'pointer', color: '#aaa', padding: '4px', flexShrink: 0,
};
const tabBarStyle = {
    display: 'flex', gap: '0', margin: '16px 20px 0',
    borderBottom: '2px solid #f0f0f0',
};
const tabStyle = {
    flex: 1, padding: '10px 8px', background: 'none', border: 'none',
    fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer',
    color: '#aaa', borderBottom: '2px solid transparent',
    marginBottom: '-2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
};
const activeTabStyle = {
    ...tabStyle, color: '#1a1a1a', borderBottomColor: '#1a1a1a',
};
const raterBadgeStyle = {
    fontSize: '0.7rem', backgroundColor: '#f0f0f0', color: '#888',
    padding: '1px 6px', borderRadius: '999px', fontWeight: '700',
};
const tabContentStyle = {
    padding: '20px',
};
const overallRowStyle = {
    backgroundColor: '#fafafa', borderRadius: '16px',
    padding: '18px 16px', marginBottom: '20px', textAlign: 'center',
};
const dimRowStyle = {
    display: 'flex', alignItems: 'center', gap: '12px',
};
const dimLabelStyle = {
    fontSize: '0.85rem', fontWeight: '700', color: '#444',
    width: '52px', flexShrink: 0,
};
const dimValueStyle = {
    fontSize: '0.82rem', color: '#aaa', fontWeight: '600',
    width: '16px', textAlign: 'right', flexShrink: 0,
};
const saveBtnStyle = {
    width: '100%', padding: '14px', borderRadius: '12px',
    border: 'none', backgroundColor: '#1a1a1a', color: '#fff',
    fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer',
};
const emptyStyle = {
    textAlign: 'center', padding: '40px 20px',
};

export default BookRatingModal;
