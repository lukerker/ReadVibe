import React from 'react';

const Bookcard = ({ book }) => {
    return (
        <div style={{ padding: '16px', border: '1px solid #eee', borderRadius: '12px', marginBottom: '12px' }}>
            <h4 style={{ margin: '0 0 8px 0' }}>{book?.title || '書名未知'}</h4>
            <p style={{ margin: 0, color: '#888', fontSize: '0.9rem' }}>{book?.author || '作者未知'}</p>
        </div>
    );
};

export default Bookcard;
