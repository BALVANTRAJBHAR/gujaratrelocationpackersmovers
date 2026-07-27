export const SITE_URL = 'https://gujaratrelocationpackers.com';
export const SITE_NAME = 'Gujarat Relocation Packers';
export const SITE_DESCRIPTION =
  'Gujarat Relocation Packers provides trusted house shifting, office relocation, packers and movers, home services, and property management solutions across India.';

export const SITE_KEYWORDS = [
  'Gujarat Relocation Packers & Movers',
  'packers and movers Gujarat',
  'packers and movers Ahmedabad',
  'house shifting services Gujarat',
  'home relocation services',
  'office relocation Gujarat',
  'home services',
  'AC repair service',
  'carpenter service',
  'electrician service',
  'plumber service',
  'pest control service',
  'deep cleaning service',
  'painting service',
  'RO service',
  'property management Gujarat',
  'house for rent Gujarat',
  'property buy sell Gujarat',
  'commercial property Gujarat',
  'PG hostel Gujarat',
  'flatmates Gujarat',
  'rental property services',
  'vehicle transportation',
  'home services marketplace',
  'real estate Gujarat',
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
    { '@type': 'City', name: 'Ahmedabad' },
    { '@type': 'City', name: 'Surat' },
    { '@type': 'City', name: 'Vadodara' },
    { '@type': 'City', name: 'Rajkot' },
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
    'Vehicle transportation',
    'Real estate services',
  ],
  makesOffer: [
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Packers and Movers' } },
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Home Shifting' } },
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Office Relocation' } },
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Vehicle Transportation' } },
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'AC Repair' } },
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Carpenter Service' } },
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Electrician Service' } },
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Plumber Service' } },
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Pest Control' } },
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Deep Cleaning' } },
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Painting Service' } },
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Property Management' } },
    { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Real Estate Services' } },
  ],
};

// ─── Page-specific SEO metadata ─────────────────────────────────────────────

export type PageSeo = {
  title: string;
  description: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  canonical?: string;
};

export const HOME_SEO: PageSeo = {
  title: 'Gujarat Relocation Packers & Movers | House Shifting, Home Services & Property Management',
  description:
    'Gujarat Relocation Packers & Movers — trusted packers and movers in Gujarat. Professional house shifting, office relocation, vehicle transportation, home services, and property management. Get a free quote today!',
  keywords:
    'Gujarat Relocation Packers & Movers, packers and movers Gujarat, house shifting services, home relocation, office relocation Gujarat',
};

export const SERVICES_SEO: PageSeo = {
  title: 'Packers and Movers Gujarat | Home Shifting & Office Relocation Services',
  description:
    'Professional packers and movers in Gujarat. Affordable house shifting, office relocation, and vehicle transportation services. Experienced team, safe handling, on-time delivery.',
  canonical: `${SITE_URL}/services/household-shifting`,
};

export const HOME_SERVICES_SEO: PageSeo = {
  title: 'Home Services Gujarat | AC Repair, Electrician, Carpenter, Plumbing & Cleaning',
  description:
    'Book trusted home services in Gujarat — AC repair, electrician, carpenter, plumber, pest control, deep cleaning, painting, and RO service. Professional technicians at your doorstep.',
};

export const PROPERTIES_SEO: PageSeo = {
  title: 'Property Management Gujarat | Buy, Rent Houses, Flats, PG & Commercial Property',
  description:
    'Find houses, flats, PG hostels, and commercial properties for rent or sale in Gujarat. No-broker property listings, property management services, and real estate solutions.',
};

export const TERMS_SEO: PageSeo = {
  title: 'Terms & Conditions | Gujarat Relocation Packers & Movers',
  description:
    'Terms and conditions for using Gujarat Relocation Packers & Movers services. Includes liability, cancellation policy, damage claims, and service guidelines.',
};

export const PRIVACY_SEO: PageSeo = {
  title: 'Privacy Policy | Gujarat Relocation Packers & Movers',
  description:
    'Privacy policy for Gujarat Relocation Packers & Movers. Learn how we collect, use, and protect your personal information.',
};

export const SUPPORT_SEO: PageSeo = {
  title: 'Contact Support | Gujarat Relocation Packers & Movers',
  description:
    'Contact Gujarat Relocation Packers & Movers support team. Get help with bookings, payments, moving services, and inquiries.',
};

export const REFER_SEO: PageSeo = {
  title: 'Refer & Earn | Gujarat Relocation Packers & Movers',
  description:
    'Refer your friends and earn rewards with Gujarat Relocation Packers & Movers referral program. Share the benefits of professional moving services.',
};

export function pageToSeo(path: string): PageSeo | undefined {
  const map: Record<string, PageSeo> = {
    home: HOME_SEO,
    'services/household-shifting': SERVICES_SEO,
    'home-services': HOME_SERVICES_SEO,
    properties: PROPERTIES_SEO,
    'terms-and-conditions': TERMS_SEO,
    'privacy-policy': PRIVACY_SEO,
    support: SUPPORT_SEO,
    'refer-and-earn': REFER_SEO,
  };
  return map[path];
}
