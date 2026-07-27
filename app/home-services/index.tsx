import Head from 'expo-router/head';
import React from 'react';

import { HOME_SERVICES_SEO } from '@/constants/seo';
import HomeServiceScreen from '../(tabs)/home-service';

export default function HomeServicesIndexRoute() {
  return (
    <>
      <Head>
        <title>{HOME_SERVICES_SEO.title}</title>
        <meta name="description" content={HOME_SERVICES_SEO.description} />
        <meta property="og:title" content={HOME_SERVICES_SEO.title} />
        <meta property="og:description" content={HOME_SERVICES_SEO.description} />
      </Head>
      <HomeServiceScreen />
    </>
  );
}
