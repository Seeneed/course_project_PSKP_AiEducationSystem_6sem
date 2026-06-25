import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmText = 'OK',
    cancelText = 'Отмена',
    danger = false,
    onConfirm,
    onClose,
}) {
    const [pending, setPending] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Escape' && !pending) onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose, pending]);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    useEffect(() => {
        if (!open) setPending(false);
    }, [open]);

    if (!open) return null;

    const handleConfirm = async () => {
        if (!onConfirm || pending) return;
        setPending(true);
        try {
            await onConfirm();
            onClose();
        } finally {
            setPending(false);
        }
    };

    return createPortal(
        <div
            className="confirm-dialog-backdrop"
            role="presentation"
            onClick={pending ? undefined : onClose}
        >
            <div
                className="confirm-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-desc"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id="confirm-dialog-title" className="confirm-dialog-title">
                    {title}
                </h2>
                <p id="confirm-dialog-desc" className="confirm-dialog-message">
                    {message}
                </p>
                <div className="confirm-dialog-actions">
                    <button
                        type="button"
                        className="btn-outline confirm-dialog-btn"
                        onClick={onClose}
                        disabled={pending}
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        className={`confirm-dialog-btn ${danger ? 'btn-red' : 'btn-green'}`}
                        onClick={handleConfirm}
                        disabled={pending}
                    >
                        {pending ? 'Подождите…' : confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
