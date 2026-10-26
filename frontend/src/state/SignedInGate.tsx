import { use, useState, type ReactNode } from 'react';
import { SignInPage } from '../features/sign-in/SignInPage';
import { initialSignedIn } from './session';

/** Shows sign-in until the server accepts this browser's session, then the app. */
export function SignedInGate({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(use(initialSignedIn));
  return signedIn ? children : <SignInPage onSignedIn={() => setSignedIn(true)} />;
}
