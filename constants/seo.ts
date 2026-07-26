export const SITE_URL = 'https://gujaratrelocationpackers.com';
export const SITE_NAME = 'Gujarat Relocation Packers';
export const SITE_DESCRIPTION =
  'Gujarat Relocation Packers provides trusted house shifting, office relocation, packers and movers, home services, and property management solutions across India.';

// Includes the brand searches requested by the owner as well as high-intent service searches.
export const SITE_KEYWORDS = [
  'Gujarat Relocation Packers',
  'packers and movers',
  'gujaratrelocationpackers&movers',
  'gujaratrelocationpackersandmovers',
  'gujaratrelocation',
  'house shifting services',
  'home shifting',
  'office shifting',
  'local movers',
  'intercity movers',
  'packers movers Mumbai',
  'packers movers Gujarat',
  'home services',
  'property management',
  'no broker property listings',
  'rental property',
  'buy sell property',
].join(', ');

export const LOCAL_BUSINESS_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'MovingCompany',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.png`,
  image: `${SITE_URL}/og-image.png`,
  email: 'Gujaratrelocation.owner@gmail.com',
  telephone: '+91-9987963470',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Sethia Aashray',
    addressLocality: 'Mumbai',
    postalCode: '400101',
    addressCountry: 'IN',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 19.1934514,
    longitude: 72.8703993,
  },
  areaServed: [
    { '@type': 'State', name: 'Gujarat' },
    { '@type': 'State', name: 'Maharashtra' },
    { '@type': 'Country', name: 'India' },
  ],
  sameAs: [],
  knowsAbout: [
    'Packers and movers',
    'House shifting',
    'Office relocation',
    'Home services',
    'Property management',
  ],
};
