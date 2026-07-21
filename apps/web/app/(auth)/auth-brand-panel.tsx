/* biome-ignore-all lint/a11y/noSvgWithoutTitle: decorative motifs inside an aria-hidden panel. */
import styles from "./auth-split.module.css";

/**
 * Brand body for the auth split panel: the tally wordmark draws itself,
 * the motto rises, then two strands merge into one vermilion rail.
 * Pure CSS one-shot motion; static under reduced motion.
 */
export function AuthBrandPanel() {
  return (
    <div className={styles.brandBody}>
      <svg
        aria-hidden="true"
        className={styles.tally}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="5"
        viewBox="0 0 96 72"
      >
        <line className={styles.tallyStroke} pathLength="1" x1="14" x2="14" y1="12" y2="60" />
        <line className={styles.tallyStroke} pathLength="1" x1="35" x2="35" y1="12" y2="60" />
        <line className={styles.tallyStroke} pathLength="1" x1="56" x2="56" y1="12" y2="60" />
        <line className={styles.tallyStroke} pathLength="1" x1="77" x2="77" y1="12" y2="60" />
        <line className={styles.tallySlash} pathLength="1" x1="4" x2="92" y1="52" y2="20" />
      </svg>

      <p className={styles.tagline}>
        Invisible payments — for you, <em>and for your AI.</em>
      </p>

      <svg
        aria-hidden="true"
        className={styles.strands}
        fill="none"
        preserveAspectRatio="xMidYMid meet"
        strokeLinecap="round"
        viewBox="0 0 320 96"
      >
        <path
          className={styles.strand}
          d="M8 24 C 100 24 116 48 176 48"
          pathLength="1"
          strokeWidth="2.5"
        />
        <path
          className={styles.strand}
          d="M8 72 C 100 72 116 48 176 48"
          pathLength="1"
          strokeWidth="2.5"
        />
        <path className={styles.strandRail} d="M176 48 L 312 48" pathLength="1" strokeWidth="3.5" />
      </svg>
    </div>
  );
}
