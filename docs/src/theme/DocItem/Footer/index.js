import React, { useState } from 'react';
import OriginalFooter from '@theme-original/DocItem/Footer';

export default function DocItemFooterWrapper(props) {
  const [vote, setVote] = useState(null);

  return (
    <>
      <section className="doc-helpful" aria-labelledby="doc-helpful-title">
        <div>
          <h2 id="doc-helpful-title">Was this page helpful?</h2>
          <p>Help us keep MCP Portal documentation practical, grounded, and agent-ready.</p>
        </div>
        <div className="doc-helpful__actions" role="group" aria-label="Documentation feedback">
          <button type="button" className={vote === 'yes' ? 'is-selected' : ''} onClick={() => setVote('yes')}>
            Yes
          </button>
          <button type="button" className={vote === 'no' ? 'is-selected' : ''} onClick={() => setVote('no')}>
            Needs work
          </button>
        </div>
        {vote && <p className="doc-helpful__thanks">Thanks — open an issue or PR if you want to share details.</p>}
      </section>
      <OriginalFooter {...props} />
    </>
  );
}
