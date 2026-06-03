import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';

/**
 * Reusable glass feature card for homepage and docs surfaces.
 * It remains dependency-free so the static docs portal stays fast and portable.
 */
export default function FeatureCard({ icon, title, description, to, className }) {
  const content = (
    <div className={clsx('feature-card', className)}>
      {icon && <div className="feature-card__icon" aria-hidden="true">{icon}</div>}
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {to && <span className="feature-card__arrow" aria-hidden="true">→</span>}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="feature-card__link">
        {content}
      </Link>
    );
  }

  return content;
}
