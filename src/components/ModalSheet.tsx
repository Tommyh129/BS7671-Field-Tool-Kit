import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

interface ModalSheetProps {
  children: React.ReactNode;
  onClose: () => void;
  ariaLabel: string;
  maxWidthClass?: string;
  panelClassName?: string;
  zIndexClass?: string;
}

export default function ModalSheet({
  children,
  onClose,
  ariaLabel,
  maxWidthClass = 'max-w-md',
  panelClassName = '',
  zIndexClass = 'z-[60]',
}: ModalSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className={`safe-modal-shell fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        aria-label={`Close ${ariaLabel}`}
      />
      <motion.div
        ref={panelRef}
        initial={{ y: '100%', opacity: 0.96 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.96 }}
        className={`safe-modal-panel relative w-full ${maxWidthClass} bg-hardware-card border border-hardware-border rounded-t-[32px] sm:rounded-[32px] overflow-y-auto overscroll-contain ${panelClassName}`}
      >
        {children}
      </motion.div>
    </div>
  );
}
