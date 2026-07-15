export type AuthAttempt = {
  finish: () => void;
  isCurrent: () => boolean;
  signal: AbortSignal;
};

export class AuthAttemptGate {
  private controller: AbortController | undefined;
  private generation = 0;

  begin(): AuthAttempt {
    this.controller?.abort();
    const controller = new AbortController();
    const generation = ++this.generation;
    this.controller = controller;

    return {
      finish: () => {
        if (this.generation === generation) this.controller = undefined;
      },
      isCurrent: () => this.generation === generation && !controller.signal.aborted,
      signal: controller.signal,
    };
  }

  cancel() {
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
  }
}
