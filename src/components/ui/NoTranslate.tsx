"use client";

import React from "react";

interface NoTranslateProps {
  children: React.ReactNode;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
}

/**
 * Component that prevents Google Translate from translating its content.
 * Use this to wrap proper nouns like RAYA, Bluestift, etc.
 *
 * Uses both `translate="no"` HTML attribute and `notranslate` class
 * which are recognized by Google Translate.
 */
export function NoTranslate({
  children,
  as: Component = "span",
  className = ""
}: NoTranslateProps) {
  return (
    <Component
      translate="no"
      className={`notranslate ${className}`.trim()}
    >
      {children}
    </Component>
  );
}

// Pre-configured components for common proper nouns
export function RayaName({ className = "" }: { className?: string }) {
  return <NoTranslate className={className}>RAYA</NoTranslate>;
}

export function BluestiftName({ className = "" }: { className?: string }) {
  return <NoTranslate className={className}>Bluestift</NoTranslate>;
}

export function TheBluestiftName({ className = "" }: { className?: string }) {
  return <NoTranslate className={className}>TheBluestift</NoTranslate>;
}

export default NoTranslate;
