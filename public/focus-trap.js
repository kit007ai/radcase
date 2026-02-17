// Focus trap utility for modal accessibility (WCAG 2.4.3)
'use strict';

window.focusTrap = {
  _activeTraps: [],
  _previousFocus: null,

  activate(modalElement) {
    if (!modalElement) return;

    // Store the element that had focus before the modal opened
    this._previousFocus = document.activeElement;
    this._activeTraps.push(modalElement);

    // Focus the first focusable element in the modal
    requestAnimationFrame(() => {
      const firstFocusable = this._getFocusableElements(modalElement)[0];
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        modalElement.setAttribute('tabindex', '-1');
        modalElement.focus();
      }
    });

    // Add keydown listener for Tab trapping
    modalElement._trapHandler = (e) => this._handleTab(e, modalElement);
    modalElement.addEventListener('keydown', modalElement._trapHandler);
  },

  deactivate(modalElement) {
    if (!modalElement) return;

    // Remove keydown listener
    if (modalElement._trapHandler) {
      modalElement.removeEventListener('keydown', modalElement._trapHandler);
      delete modalElement._trapHandler;
    }

    // Remove from stack
    const index = this._activeTraps.indexOf(modalElement);
    if (index > -1) this._activeTraps.splice(index, 1);

    // Restore focus to the element that triggered the modal
    if (this._previousFocus && typeof this._previousFocus.focus === 'function') {
      this._previousFocus.focus();
      this._previousFocus = null;
    }
  },

  _handleTab(e, modalElement) {
    if (e.key !== 'Tab') return;

    const focusable = this._getFocusableElements(modalElement);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: if on first element, wrap to last
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: if on last element, wrap to first
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  },

  _getFocusableElements(container) {
    const selectors = [
      'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
      'details', 'summary'
    ];
    return Array.from(container.querySelectorAll(selectors.join(',')))
      .filter(el => !el.closest('[hidden]') && !el.closest('.hidden') && el.offsetParent !== null);
  }
};
