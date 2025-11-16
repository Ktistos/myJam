import React from 'react';

/**
 * A modal dialog to replace alert() and confirm().
 */
const Modal = ({ title, message, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
    <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
      <h3 className="text-xl font-bold text-white mb-4">{title}</h3>
      <p className="text-gray-300 mb-6">{message}</p>
      <button
        onClick={onClose}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200"
      >
        Close
      </button>
    </div>
  </div>
);

export default Modal;