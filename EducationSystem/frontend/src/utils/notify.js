import React from 'react';
import { toast } from 'react-hot-toast';
import { FiAlertCircle, FiCheckCircle, FiInfo } from 'react-icons/fi';

const baseStyle = {
  borderRadius: '10px',
  padding: '10px 12px',
  fontSize: '14px',
  fontWeight: 500,
};

export const notify = {
  success: (message) =>
    toast.success(message, {
      icon: React.createElement(FiCheckCircle, { size: 16 }),
      style: {
        ...baseStyle,
        border: '1px solid #cfe8da',
        background: '#f4fbf7',
        color: '#1f5136',
      },
    }),
  error: (message) =>
    toast.error(message, {
      icon: React.createElement(FiAlertCircle, { size: 16 }),
      duration: 4500,
      style: {
        ...baseStyle,
        border: '1px solid #f0c7cc',
        background: '#fff5f6',
        color: '#7e2a34',
      },
    }),
  info: (message) =>
    toast(message, {
      icon: React.createElement(FiInfo, { size: 16 }),
      style: {
        ...baseStyle,
        border: '1px solid #d9e3ef',
        background: '#f7f9fc',
        color: '#29415f',
      },
    }),
};
