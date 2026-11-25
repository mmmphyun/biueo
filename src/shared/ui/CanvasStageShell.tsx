import { useEffect, useRef, type ReactNode } from 'react';

interface CanvasStageShellProps {
  readonly onPauseChange: (paused: boolean) => void;
  readonly children: ReactNode;
}

/**
 * 캔버스 가시성·페이지 백그라운드 전환 시 엔진 루프를 일시정지/재개하는 공용 스테이지 래퍼.
 */
export function CanvasStageShell({ onPauseChange, children }: CanvasStageShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const onPauseRef = useRef(onPauseChange);
  onPauseRef.current = onPauseChange;

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    // Modern Web Guidance (efficient-background-processing):
    // contentvisibilityautostatechange는 버블링하지 않으므로 .shelf-stage-shell에 직접 연결한다.
    const handleContentVisibility = (event: Event) => {
      const skipped = Boolean((event as Event & { skipped?: boolean }).skipped);
      onPauseRef.current(skipped || document.hidden);
    };
    shell.addEventListener('contentvisibilityautostatechange', handleContentVisibility);

    let intersectionObserver: IntersectionObserver | null = null;
    if (!('contentVisibility' in document.documentElement.style)) {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            onPauseRef.current(!entry.isIntersecting || document.hidden);
          }
        },
        { rootMargin: '200px' }
      );
      intersectionObserver.observe(shell);
    }

    const handleVisibility = () => {
      onPauseRef.current(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      shell.removeEventListener('contentvisibilityautostatechange', handleContentVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
      intersectionObserver?.disconnect();
    };
  }, []);

  return (
    <div ref={shellRef} className="shelf-stage-shell">
      {children}
    </div>
  );
}
