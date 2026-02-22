import React from 'react';

const ProgressBar = ({ value = 0, max = 100 }) => {
    const percent = Math.min(100, Math.round((value / max) * 100));
    return (
        <div style={{ backgroundColor: '#eee', borderRadius: '999px', height: '8px', width: '100%' }}>
            <div style={{ backgroundColor: '#1a1a1a', borderRadius: '999px', height: '8px', width: `${percent}%` }} />
        </div>
    );
};

export default ProgressBar;
