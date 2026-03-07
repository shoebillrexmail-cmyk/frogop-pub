import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMountedRef } from '../useMountedRef.ts';

describe('useMountedRef', () => {
    it('returns true while component is mounted', () => {
        const { result } = renderHook(() => useMountedRef());
        expect(result.current.current).toBe(true);
    });

    it('returns false after component unmounts', () => {
        const { result, unmount } = renderHook(() => useMountedRef());
        const ref = result.current;
        expect(ref.current).toBe(true);
        unmount();
        expect(ref.current).toBe(false);
    });
});
