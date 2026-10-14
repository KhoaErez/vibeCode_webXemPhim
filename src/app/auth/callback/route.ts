import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const next = searchParams.get('next') ?? '/';

  // Ensure redirect target is a safe relative URL
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (error) {
    console.error('OAuth callback error:', error, errorDescription);
    const redirectUrl = new URL(safeNext, origin);
    redirectUrl.searchParams.set('auth_error', encodeURIComponent(errorDescription || error));
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (code) {
    const supabase = await createClient();
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('Session exchange error:', exchangeError.message);
      const redirectUrl = new URL(safeNext, origin);
      redirectUrl.searchParams.set('auth_error', encodeURIComponent(exchangeError.message));
      return NextResponse.redirect(redirectUrl.toString());
    }

    // Ensure user profile exists for new Google OAuth users
    const user = data?.user;
    if (user) {
      try {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();

        if (!existingProfile) {
          const rawName = user.user_metadata?.full_name || user.user_metadata?.name;
          const fallbackName = user.email ? user.email.split('@')[0] : 'Khán giả';
          const username = (rawName && rawName.trim()) ? rawName.trim() : fallbackName;
          const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;

          await supabase.from('profiles').insert({
            id: user.id,
            username,
            avatar_url: avatarUrl,
          });
        }
      } catch (profileErr) {
        console.warn('Could not auto-create profile:', profileErr);
      }
    }

    return NextResponse.redirect(new URL(safeNext, origin).toString());
  }

  return NextResponse.redirect(new URL('/', origin).toString());
}
