import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/splash');
    }, 0);
    return () => clearTimeout(timer);
  }, [router]);

  return null;
}
