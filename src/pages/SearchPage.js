import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../service/firebase';
import BookRatingModal from '../components/BookRatingModal';

// ── Curated pool of 42 search queries with intitle: for precise matching ──
const DISCOVER_POOL = [
    'intitle:解憂雜貨店 inauthor:東野圭吾',
    'intitle:原子習慣',
    'intitle:被討厭的勇氣',
    'intitle:人類大歷史',
    'intitle:刻意練習',
    'intitle:為什麼要睡覺',
    'intitle:致富心態',
    'intitle:深度工作力',
    'intitle:零秒思考',
    'intitle:情緒勒索 inauthor:周慕姿',
    'intitle:蛤蟆先生去看心理師',
    'intitle:心流 inauthor:Csikszentmihalyi',
    'intitle:82年生的金智英',
    'intitle:月亮與六便士',
    'intitle:小王子',
    'intitle:1984 inauthor:Orwell',
    'intitle:自私的基因',
    'intitle:清單革命',
    'intitle:IKIGAI',
    'intitle:底層邏輯 inauthor:劉潤',
    'intitle:高敏感是種天賦',
    'intitle:薩提爾的對話練習',
    'intitle:格局 inauthor:楊定一',
    'intitle:讀懂一本書 inauthor:樊登',
    'intitle:夜晚的潛水艇 inauthor:陳春成',
    'intitle:一個人住第幾年',
    'intitle:親愛的陌生人 A Gentleman in Moscow',
    'intitle:未來在等待的人才 inauthor:Daniel Pink',
    'intitle:Think Again inauthor:Adam Grant',
    'intitle:駭客與畫家 inauthor:Paul Graham',
    'intitle:精準閱讀',
    'intitle:貝佐斯傳 Everything Store',
    'intitle:賈伯斯傳 inauthor:Isaacson',
    'intitle:思考的藝術 inauthor:Dobelli',
    'intitle:素食者 inauthor:Han Kang',
    'intitle:白夜行 inauthor:東野圭吾',
    'intitle:Educated inauthor:Westover',
    'intitle:活出意義來 inauthor:Frankl',
    'intitle:人生四千個禮拜',
    'intitle:高效人士的七個習慣 inauthor:Covey',
    'intitle:異數 Outliers inauthor:Malcolm Gladwell',
    'intitle:窮查理的普通常識 inauthor:Charlie Munger',
];

// ── Seeded PRNG (mulberry32) ───────────────────────────────────────
const mulberry32 = (seed) => {
    let s = seed;
    return () => {
        s |= 0; s = s + 0x6D2B79F5 | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const hashDate = (dateStr) => {
    let h = 2166136261;
    for (let i = 0; i < dateStr.length; i++) {
        h ^= dateStr.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

// Cache key version — bump this string to invalidate old caches
const CACHE_VER = 'v2';

// Today's date string YYYY-MM-DD (台灣時間 UTC+8)
const getTodayKey = () => {
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return now.toISOString().slice(0, 10);
};

// Returns 6 unique queries for today, deterministic
const getTodayQueries = () => {
    const key = `discover_${CACHE_VER}_${getTodayKey()}`;
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);

    const rand = mulberry32(hashDate(getTodayKey()));
    const pool = [...DISCOVER_POOL];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picks = pool.slice(0, 6);
    localStorage.setItem(key, JSON.stringify(picks));
    return picks;
};

// ── Genre chips ────────────────────────────────────────────────────
const GENRES = [
    { label: '📈 商業財經', query: '商業 財經 投資' },
    { label: '🧠 心理學', query: '心理學 self-help 認知' },
    { label: '🔬 科普', query: '科學 科普 宇宙' },
    { label: '🌏 歷史', query: '歷史 台灣史 世界史' },
    { label: '💻 程式設計', query: 'programming 程式 軟體開發' },
    { label: '🎨 設計創意', query: '設計 創意 藝術' },
    { label: '📖 小說', query: '小說 fiction 故事' },
    { label: '🌱 生活哲學', query: '哲學 生活 療癒 練習' },
    { label: '🌍 旅行', query: '旅行 遊記 世界' },
    { label: '🍳 飲食料理', query: '料理 食譜 飲食 烹飪' },
];

// ── Helpers ────────────────────────────────────────────────────────
const getBookInfo = (book) => {
    const info = book.volumeInfo || {};
    return {
        id: book.id,
        title: info.title || '未知書名',
        authors: (info.authors || ['未知作者']).join(', '),
        thumbnail: (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '').replace('http:', 'https:'),
        totalPages: info.pageCount || 0,
        description: info.description || '',
        categories: info.categories || [],
        publisher: info.publisher || '',
        publishedDate: info.publishedDate || '',
        averageRating: info.averageRating || 0,
        ratingsCount: info.ratingsCount || 0,
        previewLink: info.previewLink || '',
    };
};

const BOOKS_API_KEY = process.env.REACT_APP_BOOKS_API_KEY || '';
const KEY_PARAM = BOOKS_API_KEY ? `&key=${BOOKS_API_KEY}` : '';

const fetchByQuery = async (q, maxResults = 24) => {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${maxResults}&orderBy=relevance${KEY_PARAM}`);
    const data = await res.json();
    return data.items || [];
};

const fetchById = async (id) => {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes/${id}${KEY_PARAM ? '?' + KEY_PARAM.slice(1) : ''}`);
    if (!res.ok) return null;
    return await res.json();
};

// ── Stars ──────────────────────────────────────────────────────────
const Stars = ({ rating }) => {
    if (!rating) return null;
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    return (
        <span style={{ color: '#f59e0b', fontSize: '0.9rem' }}>
            {'★'.repeat(full)}{half ? '☆' : ''}{'☆'.repeat(5 - full - (half ? 1 : 0))}
            <span style={{ color: '#888', fontSize: '0.75rem', marginLeft: '4px' }}>{rating.toFixed(1)}</span>
        </span>
    );
};

// ── BookDetailModal ────────────────────────────────────────────────
const BookDetailModal = ({ book, isInShelf, onAddToShelf, onClose, adding }) => {
    const b = getBookInfo(book);
    const [expanded, setExpanded] = useState(false);
    const [showRatingModal, setShowRatingModal] = useState(false);
    const [communityRating, setCommunityRating] = useState({ avg: 0, count: 0 });
    const [isInWishlist, setIsInWishlist] = useState(false);
    const [wishlistLoading, setWishlistLoading] = useState(false);
    const shortDesc = b.description.length > 300 ? b.description.slice(0, 300) + '…' : b.description;
    const uid = auth.currentUser?.uid;

    useEffect(() => {
        if (!uid) return;
        const unsub = db.collection('users').doc(uid).collection('wishlist').doc(book.id)
            .onSnapshot(snap => setIsInWishlist(snap.exists));
        return () => unsub();
    }, [book.id, uid]);

    const toggleWishlist = async () => {
        if (!uid || wishlistLoading) return;
        setWishlistLoading(true);
        const ref = db.collection('users').doc(uid).collection('wishlist').doc(book.id);
        if (isInWishlist) {
            await ref.delete();
        } else {
            await ref.set({
                bookId: book.id,
                title: b.title,
                author: b.authors,
                thumbnail: b.thumbnail || '',
                totalPages: b.totalPages || 0,
                addedAt: new Date(),
            });
        }
        setWishlistLoading(false);
    };

    useEffect(() => {
        const unsub = db.collection('bookRatings').doc(book.id).collection('ratings')
            .onSnapshot(snap => {
                const docs = snap.docs.map(d => d.data()).filter(d => d.overall > 0);
                const avgOverall = docs.length
                    ? docs.reduce((s, d) => s + (d.overall || 0), 0) / docs.length
                    : 0;
                setCommunityRating({ avg: avgOverall, count: docs.length });
            });
        return () => unsub();
    }, [book.id]);

    return (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
            {showRatingModal && (
                <BookRatingModal
                    bookId={book.id}
                    bookTitle={b.title}
                    bookThumbnail={b.thumbnail}
                    canRate={false}
                    onClose={() => setShowRatingModal(false)}
                />
            )}
            <div style={detailModalStyle}>
                <button onClick={onClose} style={closeStyle}>✕</button>
                <div style={detailHeaderStyle}>
                    <div style={detailCoverWrapStyle}>
                        {b.thumbnail
                            ? <img src={b.thumbnail} alt={b.title} style={detailCoverStyle} />
                            : <div style={coverPlaceholderStyle}>📖</div>}
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={detailTitleStyle}>{b.title}</h2>
                        <p style={detailAuthorStyle}>{b.authors}</p>
                        {b.publisher && <p style={metaStyle}>🏢 {b.publisher}{b.publishedDate ? ` · ${b.publishedDate.slice(0, 4)}` : ''}</p>}
                        {b.totalPages > 0 && <p style={metaStyle}>📄 {b.totalPages} 頁</p>}
                        {b.categories.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                {b.categories.slice(0, 3).map(c => <span key={c} style={catChipStyle}>{c}</span>)}
                            </div>
                        )}
                        {b.averageRating > 0 && (
                            <div style={{ marginTop: '10px' }}>
                                <Stars rating={b.averageRating} />
                                <span style={{ fontSize: '0.75rem', color: '#aaa', marginLeft: '6px' }}>({b.ratingsCount?.toLocaleString()} 評分)</span>
                            </div>
                        )}
                    </div>
                </div>
                {b.description && (
                    <div style={{ marginTop: '20px' }}>
                        <h4 style={sectionHeadStyle}>📝 書籍介紹</h4>
                        <p style={descStyle}>{expanded ? b.description : shortDesc}</p>
                        {b.description.length > 300 && (
                            <button onClick={() => setExpanded(v => !v)} style={expandBtnStyle}>
                                {expanded ? '收起 ▲' : '展開全文 ▼'}
                            </button>
                        )}
                    </div>
                )}
                <div style={detailActionsStyle}>
                    <button onClick={() => !isInShelf && onAddToShelf(book)}
                        disabled={isInShelf || adding}
                        style={isInShelf ? addedBtnStyle : addBtnStyle}>
                        {adding ? '加入中…' : isInShelf ? '✓ 已在書架' : '＋ 加入書架'}
                    </button>
                    <button
                        onClick={toggleWishlist}
                        disabled={wishlistLoading || isInShelf}
                        style={isInWishlist ? wishlistAddedBtnStyle : wishlistBtnStyle}
                        title={isInShelf ? '已在書架' : isInWishlist ? '從願望清單移除' : '加入願望清單'}>
                        {isInShelf ? '—' : isInWishlist ? '📌 已在清單' : '📌 加入願望清單'}
                    </button>
                    {communityRating.count > 0 ? (
                        <button onClick={() => setShowRatingModal(true)} style={communityRatingBtnStyle}>
                            <span style={{ color: '#f59e0b' }}>★</span>
                            <span style={{ fontWeight: '700' }}>{communityRating.avg.toFixed(1)}</span>
                            <span style={{ fontSize: '0.78rem', color: '#aaa' }}>({communityRating.count}人評分)</span>
                        </button>
                    ) : (
                        <span style={{ fontSize: '0.8rem', color: '#ccc' }}>還沒有社群評分</span>
                    )}
                    {b.previewLink && (
                        <a href={b.previewLink} target="_blank" rel="noopener noreferrer" style={previewLinkStyle}>
                            📖 在 Google Books 預覽
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── BookCard ───────────────────────────────────────────────────────
const BookCard = ({ book, isInShelf, onSelect }) => {
    const b = getBookInfo(book);
    return (
        <div style={cardStyle} onClick={() => onSelect(book)} title="點擊查看詳情">
            <div style={coverWrapStyle}>
                {b.thumbnail
                    ? <img src={b.thumbnail} alt={b.title} style={coverStyle} />
                    : <div style={coverPlaceholderStyle}>📖</div>}
                {isInShelf && <div style={inShelfBadgeStyle}>✓ 書架</div>}
            </div>
            <div style={cardBodyStyle}>
                <h4 style={bookTitleStyle}>{b.title}</h4>
                <p style={authorStyle}>{b.authors}</p>
                {b.totalPages > 0 && <p style={pageCountStyle}>{b.totalPages} 頁</p>}
            </div>
        </div>
    );
};

// ── Main ───────────────────────────────────────────────────────────
const SearchPage = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [myBookIds, setMyBookIds] = useState(new Set());
    const [addingId, setAddingId] = useState(null);
    const [selectedBook, setSelectedBook] = useState(null);
    const [discoverBooks, setDiscoverBooks] = useState([]);
    const [discoverLoading, setDiscoverLoading] = useState(true);
    const [activeGenre, setActiveGenre] = useState(null);

    // 書架 ID 即時監聽
    useEffect(() => {
        if (!auth.currentUser) return;
        const unsub = db.collection('users').doc(auth.currentUser.uid).collection('books')
            .onSnapshot(snap => setMyBookIds(new Set(snap.docs.map(d => d.id))));
        return () => unsub();
    }, []);

    // 載入今日探索書單
    useEffect(() => {
        const loadDiscover = async () => {
            setDiscoverLoading(true);
            const queries = getTodayQueries();
            const books = await Promise.all(
                queries.map(q => fetchByQuery(q, 1).then(items => items[0] || null).catch(() => null))
            );
            setDiscoverBooks(books.filter(Boolean));
            setDiscoverLoading(false);
        };
        loadDiscover();
    }, []);

    const searchBooks = useCallback(async (q = query) => {
        if (!q.trim()) return;
        setLoading(true);
        setResults([]);
        setActiveGenre(null);
        try {
            const items = await fetchByQuery(q, 24);
            setResults(items);
        } catch (_) {
            alert('搜尋失敗，請稍後再試。');
        } finally {
            setLoading(false);
        }
    }, [query]);

    const handleGenre = async (genre) => {
        setActiveGenre(genre.label);
        setQuery(genre.query);
        setLoading(true);
        setResults([]);
        try {
            const items = await fetchByQuery(genre.query, 24);
            setResults(items);
        } catch (_) { } finally { setLoading(false); }
    };

    const addToShelf = async (book) => {
        if (!auth.currentUser) return;
        const b = getBookInfo(book);
        const uid = auth.currentUser.uid;
        setAddingId(book.id);
        try {
            await db.collection('users').doc(uid).collection('books').doc(book.id).set({
                bookId: book.id, title: b.title, author: b.authors,
                thumbnail: b.thumbnail, totalPages: b.totalPages,
                currentPage: 0, addedAt: new Date(),
            });
            // Write public mirror so others can find lenders
            const userDoc = await db.collection('users').doc(uid).get();
            const displayName = userDoc.exists ? (userDoc.data().displayName || auth.currentUser.email) : auth.currentUser.email;
            await db.collection('publicShelves').doc(book.id).collection('holders').doc(uid).set({
                userId: uid, displayName, thumbnail: b.thumbnail || '', addedAt: new Date(),
            });
        } catch (e) { alert('加入失敗：' + e.message); }
        finally { setAddingId(null); }
    };

    const todayLabel = (() => {
        const d = new Date();
        return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
    })();

    const showDiscovery = results.length === 0 && !loading;

    return (
        <div style={pageStyle}>
            {selectedBook && (
                <BookDetailModal book={selectedBook}
                    isInShelf={myBookIds.has(selectedBook.id)}
                    adding={addingId === selectedBook.id}
                    onAddToShelf={addToShelf}
                    onClose={() => setSelectedBook(null)} />
            )}

            <header style={headerStyle}>
                <h2 style={titleStyle}>🔍 找新書</h2>
                <p style={subtitleStyle}>輸入書名、作者或關鍵字，或從下方分類和每日書單中探索。</p>
            </header>

            {/* Search bar */}
            <div style={searchBarStyle}>
                <input type="text" placeholder="輸入書名、作者或關鍵字…"
                    value={query} onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchBooks()}
                    style={inputStyle} />
                <button onClick={() => searchBooks()} style={searchBtnStyle} disabled={loading}>
                    {loading ? '搜尋中…' : '搜尋'}
                </button>
            </div>

            {/* Genre chips */}
            <div style={genreChipsStyle}>
                {results.length > 0 && (
                    <button onClick={() => { setResults([]); setQuery(''); setActiveGenre(null); }} style={clearBtnStyle}>
                        ✕ 清除
                    </button>
                )}
                {GENRES.map(g => (
                    <button key={g.label} onClick={() => handleGenre(g)}
                        style={activeGenre === g.label ? activeChipStyle : chipStyle}>
                        {g.label}
                    </button>
                ))}
            </div>

            {/* Loading spinner for search */}
            {loading && (
                <div style={loadingStyle}>
                    <div style={spinnerStyle} />
                    <p style={{ color: '#aaa', margin: '12px 0 0' }}>搜尋中…</p>
                </div>
            )}

            {/* Search results */}
            {!loading && results.length > 0 && (
                <>
                    <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '20px' }}>
                        找到 {results.length} 本結果，點擊任一本書查看詳情
                    </p>
                    <div style={resultsGrid}>
                        {results.map(book => (
                            <BookCard key={book.id} book={book}
                                isInShelf={myBookIds.has(book.id)} onSelect={setSelectedBook} />
                        ))}
                    </div>
                </>
            )}

            {!loading && results.length === 0 && query && (
                <p style={hintStyle}>找不到結果，試試其他關鍵字。</p>
            )}

            {/* Daily discovery */}
            {showDiscovery && (
                <section style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                        <h3 style={rowTitleStyle}>📅 今日探索書單</h3>
                        <span style={dateBadgeStyle}>{todayLabel}</span>
                        <span style={refreshHintStyle}>每天午夜更新</span>
                    </div>
                    {discoverLoading ? (
                        <div style={loadingStyle}>
                            <div style={spinnerStyle} />
                            <p style={{ color: '#aaa', margin: '12px 0 0' }}>載入今日書單…</p>
                        </div>
                    ) : (
                        <div style={discoverGrid}>
                            {discoverBooks.map(book => (
                                <BookCard key={book.id} book={book}
                                    isInShelf={myBookIds.has(book.id)} onSelect={setSelectedBook} />
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};

// ── Styles ─────────────────────────────────────────────────────────
const pageStyle = { maxWidth: '960px', margin: '0 auto', padding: '40px 20px', fontFamily: '"Inter", -apple-system, sans-serif' };
const headerStyle = { marginBottom: '28px' };
const titleStyle = { fontSize: '1.8rem', fontWeight: '800', margin: '0 0 8px 0' };
const subtitleStyle = { color: '#888', fontSize: '0.92rem', margin: 0 };
const searchBarStyle = { display: 'flex', gap: '12px', marginBottom: '20px' };
const inputStyle = { flex: 1, padding: '14px 18px', borderRadius: '14px', border: '1px solid #e0e0e0', fontSize: '1rem', outline: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', fontFamily: 'inherit' };
const searchBtnStyle = { padding: '14px 28px', borderRadius: '14px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer' };
const genreChipsStyle = { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '32px' };
const chipStyle = { padding: '7px 14px', borderRadius: '999px', border: '1px solid #e0e0e0', backgroundColor: '#fff', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', color: '#444' };
const activeChipStyle = { ...chipStyle, backgroundColor: '#1a1a1a', color: '#fff', border: '1px solid #1a1a1a' };
const clearBtnStyle = { ...chipStyle, backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' };

const resultsGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '18px' };
const discoverGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '18px', maxWidth: '720px' };

const cardStyle = { backgroundColor: '#fff', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' };
const coverWrapStyle = { width: '100%', paddingTop: '140%', position: 'relative', backgroundColor: '#f5f5f5' };
const coverStyle = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' };
const coverPlaceholderStyle = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' };
const inShelfBadgeStyle = { position: 'absolute', top: '8px', right: '8px', backgroundColor: '#1a1a1a', color: '#fff', fontSize: '0.65rem', fontWeight: '700', padding: '3px 7px', borderRadius: '6px' };
const cardBodyStyle = { padding: '12px', display: 'flex', flexDirection: 'column', flex: 1 };
const bookTitleStyle = { fontSize: '0.85rem', fontWeight: '700', margin: '0 0 4px 0', lineHeight: 1.3, color: '#1a1a1a', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
const authorStyle = { fontSize: '0.75rem', color: '#888', margin: '0 0 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const pageCountStyle = { fontSize: '0.72rem', color: '#ccc', margin: 0 };

const rowTitleStyle = { fontSize: '1.1rem', fontWeight: '800', margin: 0 };
const dateBadgeStyle = { fontSize: '0.78rem', fontWeight: '700', backgroundColor: '#f0f9ff', color: '#0284c7', padding: '4px 10px', borderRadius: '8px' };
const refreshHintStyle = { fontSize: '0.75rem', color: '#bbb', fontStyle: 'italic' };

const hintStyle = { textAlign: 'center', color: '#aaa', marginTop: '40px', fontSize: '0.95rem' };
const loadingStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0' };
const spinnerStyle = { width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #eee', borderTopColor: '#1a1a1a', animation: 'spin 0.8s linear infinite' };

// Modal
const overlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' };
const detailModalStyle = { backgroundColor: '#fff', borderRadius: '22px', width: '100%', maxWidth: '620px', maxHeight: '88vh', overflowY: 'auto', padding: '28px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', position: 'relative' };
const closeStyle = { position: 'absolute', top: '18px', right: '20px', background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#aaa', zIndex: 1 };
const detailHeaderStyle = { display: 'flex', gap: '20px', alignItems: 'flex-start' };
const detailCoverWrapStyle = { width: '100px', flexShrink: 0 };
const detailCoverStyle = { width: '100%', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'block' };
const detailTitleStyle = { fontSize: '1.1rem', fontWeight: '800', margin: '0 0 8px 0', lineHeight: 1.3, paddingRight: '28px' };
const detailAuthorStyle = { fontSize: '0.88rem', color: '#666', margin: '0 0 8px 0', fontWeight: '600' };
const metaStyle = { fontSize: '0.8rem', color: '#aaa', margin: '3px 0' };
const catChipStyle = { fontSize: '0.72rem', backgroundColor: '#f0f4ff', color: '#1a73e8', padding: '3px 10px', borderRadius: '999px', fontWeight: '600' };
const sectionHeadStyle = { fontSize: '0.88rem', fontWeight: '700', color: '#888', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '0.06em' };
const descStyle = { fontSize: '0.9rem', color: '#444', lineHeight: 1.7, margin: 0 };
const expandBtnStyle = { background: 'none', border: 'none', color: '#1a73e8', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', padding: '6px 0 0 0' };
const detailActionsStyle = { display: 'flex', gap: '12px', marginTop: '24px', flexWrap: 'wrap', alignItems: 'center' };
const addBtnStyle = { padding: '12px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#1a1a1a', color: '#fff', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' };
const addedBtnStyle = { ...addBtnStyle, backgroundColor: '#ecfdf5', color: '#059669', cursor: 'default' };
const previewLinkStyle = { fontSize: '0.88rem', color: '#1a73e8', fontWeight: '600', textDecoration: 'none' };
const wishlistBtnStyle = { padding: '10px 16px', borderRadius: '12px', border: '1px solid #e0e0e0', background: '#fff', color: '#555', fontSize: '0.88rem', fontWeight: '600', cursor: 'pointer' };
const wishlistAddedBtnStyle = { ...wishlistBtnStyle, backgroundColor: '#fffbeb', borderColor: '#fde68a', color: '#92400e' };
const communityRatingBtnStyle = {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '10px 16px', borderRadius: '12px', border: '1px solid #f0f0f0',
    background: '#fffbeb', cursor: 'pointer', fontSize: '0.88rem',
};

// Inject spin keyframe once
if (!document.head.querySelector('style[data-spin]')) {
    const s = document.createElement('style');
    s.setAttribute('data-spin', '1');
    s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
}

export default SearchPage;
