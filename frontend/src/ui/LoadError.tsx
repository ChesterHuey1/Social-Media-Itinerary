import { Component, type ReactNode } from 'react';
import { Button } from './Button';
import s from './LoadingCards.module.css';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Shown when the trip can't be loaded, usually because the backend isn't running. */
export class LoadError extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={s.page} role="alert">
        <h1>Couldn't load your trip</h1>
        <p>The server didn't answer. Check that the backend is running, then try again.</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }
}
