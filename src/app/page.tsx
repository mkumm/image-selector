

import ImageUploader from '@/components/ImageUploader';

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">
          Zoom Participant Selector
        </h1>
        <ImageUploader />
      </div>
    </main>
  );
}
