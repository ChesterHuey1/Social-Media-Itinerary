import { useActionState } from 'react';
import { signIn } from '../../state/session';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import s from './SignIn.module.css';

export function SignInPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [error, submit, pending] = useActionState(async (_previous: string | null, form: FormData) => {
    const message = await signIn(String(form.get('password') ?? ''));
    if (message === null) onSignedIn();
    return message;
  }, null);

  return (
    <main className={s.page}>
      <form className={s.card} action={submit}>
        <h1 className={s.title}>Pinpoint</h1>
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required autoFocus />
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}
