"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 30-second resend cooldown: arm() starts the countdown; `secondsLeft`
 * reaches 0 and the resend affordance re-enables. Silent — announcements
 * are the caller's aria-live region.
 */
export function useResendCooldown(seconds = 30) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const clear = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = undefined;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const arm = useCallback(() => {
    clear();
    setSecondsLeft(seconds);
    timer.current = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clear();
          return 0;
        }
        return current - 1;
      });
    }, 1_000);
  }, [clear, seconds]);

  return { arm, coolingDown: secondsLeft > 0, secondsLeft };
}
