import React from 'react';
import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'SharedSpace';
const DEFAULT_OG_IMAGE = 'https://team5.st.ifbest.org/prefab.png';
const SITE_URL = 'https://team5.st.ifbest.org';

interface SEOHeadProps {
  title: string;
  description: string;
  ogImage?: string;
  canonical?: string;
  ogType?: string;
}

const SEOHead: React.FC<SEOHeadProps> = ({
  title,
  description,
  ogImage = DEFAULT_OG_IMAGE,
  canonical,
  ogType = 'website',
}) => {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;
  const canonicalUrl = canonical || SITE_URL;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />

      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={canonicalUrl} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      <link rel="canonical" href={canonicalUrl} />
    </Helmet>
  );
};

export default SEOHead;
