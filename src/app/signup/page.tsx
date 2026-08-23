import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/AuthForm';
import { getTranslations } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/auth/current';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getCurrentUser()) redirect('/collection');
  const { t } = await getTranslations();
  const { next } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16 sm:px-6">
      <AuthForm mode="signup" next={next} t={t} />
    </main>
  );
}
