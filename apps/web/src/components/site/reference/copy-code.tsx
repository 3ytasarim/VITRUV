'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/**
 * Discount code as a button that copies it (footer partner block, owner 2026-11-24). Without
 * clipboard access the code stays readable on the button, so nothing is lost.
 */
export function CopyCode({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      // async clipboard blocked (permissions / older browsers): classic selection copy
      const field = document.createElement('textarea');
      field.value = code;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      field.remove();
    }
    if (!ok) return; // the code stays readable on the button
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      className={className}
      onClick={copy}
      aria-label={copied ? `Code ${code} kopiert` : `Code ${code} kopieren`}
      data-track="cta_click"
      data-track-section="partner"
      data-track-label="code_copy"
    >
      <span>
        Code <strong>{code}</strong>
      </span>
      {copied ? (
        <Check aria-hidden size={15} strokeWidth={2} />
      ) : (
        <Copy aria-hidden size={15} strokeWidth={2} />
      )}
      <span aria-live="polite" className="df-partner__copied">
        {copied ? 'Kopiert' : ''}
      </span>
    </button>
  );
}
