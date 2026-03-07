import { useRef, useEffect } from 'react';

/**
 * Returns a ref that is `true` while the component is mounted and `false` after unmount.
 * Use in async handlers to guard against setState calls on unmounted components.
 */
export function useMountedRef(): React.RefObject<boolean> {
    const ref = useRef(true);
    useEffect(() => () => { ref.current = false; }, []);
    return ref;
}
