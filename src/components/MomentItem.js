import React from 'react';

const MomentItem = ({ moment }) => {
    return (
        <div style={{ padding: '16px', border: '1px solid #eee', borderRadius: '12px', marginBottom: '12px' }}>
            <p style={{ margin: 0 }}>{moment?.content || ''}</p>
        </div>
    );
};

export default MomentItem;
