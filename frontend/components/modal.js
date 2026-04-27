// Modal management utility

class ModalManager {
  constructor() {
    this.activeModal = null;
    this.bindCloseEvents();
  }

  open(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      this.activeModal = modalId;

      // Focus first input if exists
      const firstInput = modal.querySelector('input, select, textarea');
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }
    }
  }

  close(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      this.activeModal = null;

      // Clear form inputs
      const inputs = modal.querySelectorAll('input:not([type="submit"]), textarea');
      inputs.forEach(input => input.value = '');
    }
  }

  closeActive() {
    if (this.activeModal) {
      this.close(this.activeModal);
    }
  }

  bindCloseEvents() {
    // Close on background click
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.close(e.target.id);
      }
    });

    // Close on close button click
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-close')) {
        const modalId = e.target.getAttribute('data-modal');
        if (modalId) {
          this.close(modalId);
        }
      }
    });

    // Close button text buttons
    document.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-modal') &&
        e.target.classList.contains('btn-secondary')) {
        const modalId = e.target.getAttribute('data-modal');
        if (modalId) {
          this.close(modalId);
        }
      }
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.closeActive();
      }
    });
  }
}

const modalManager = new ModalManager();
