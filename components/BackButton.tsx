'use client';

import { useRouter } from 'next/navigation';

export default function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
    >
      ← Back
    </button>
  );
}
