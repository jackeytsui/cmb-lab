"use client";

import { useState, useRef, useCallback, forwardRef } from "react";
import { Input } from "@/components/ui/input";

interface IMEInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange?: (value: string) => void;
}

/**
 * IME-aware input component for Chinese text input.
 *
 * Tracks IME composition state (compositionstart/compositionend) to prevent
 * garbled characters during Chinese input. Only fires onValueChange after
 * composition is complete.
 */
export const IMEInput = forwardRef<HTMLInputElement, IMEInputProps>(
  ({ onValueChange, onChange, value, defaultValue, ...props }, ref) => {
    const isComposingRef = useRef(false);
    const [internalValue, setInternalValue] = useState(
      (value as string) ?? (defaultValue as string) ?? ""
    );

    const handleCompositionStart = useCallback(() => {
      isComposingRef.current = true;
    }, []);

    const handleCompositionEnd = useCallback(
      (e: React.CompositionEvent<HTMLInputElement>) => {
        isComposingRef.current = false;
        // Fire the final value after composition ends
        const newValue = e.currentTarget.value;
        setInternalValue(newValue);
        onValueChange?.(newValue);
      },
      [onValueChange]
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInternalValue(newValue);
        onChange?.(e);

        // Only fire value change if not in IME composition
        if (!isComposingRef.current) {
          onValueChange?.(newValue);
        }
      },
      [onChange, onValueChange]
    );

    return (
      <Input
        ref={ref}
        {...props}
        data-testid="chinese-input"
        value={internalValue}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
    );
  }
);

IMEInput.displayName = "IMEInput";
