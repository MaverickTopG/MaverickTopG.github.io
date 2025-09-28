// js/modules/ui.js

/**
 * Displays a toast message at the corner of the screen.
 * @param {string} message The message to display.
 * @param {'success'|'error'|'info'} type The type of message.
 */
export function showMessage(message, type = 'info') {
  const container = document.getElementById('messageContainer');
  if (!container) {
    console.error('Message container not found.');
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast-message ${type}`;

  let iconClass = 'fas fa-info-circle';
  if (type === 'success') iconClass = 'fas fa-check-circle';
  if (type === 'error') iconClass = 'fas fa-exclamation-circle';

  toast.innerHTML = `
    <i class="${iconClass}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // The fade-out animation is handled by CSS, but we need to remove the element from the DOM.
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 5000); // Matches the animation duration in CSS
}

/**
 * Sets the text content of an element by its ID.
 * @param {string} id The ID of the element.
 * @param {string} text The text to set.
 */
export function setTextContent(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

/**
 * Animates a number from a start value to a target value.
 * @param {string} elementId The ID of the element to update.
 * @param {number} targetValue The final value.
 * @param {number} decimals The number of decimal places to show.
 * @param {function(number): string} formatter A function to format the final number.
 */
export function animateNumber(elementId, targetValue, decimals = 0, formatter = null) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const startValue = 0; // Always start animation from 0 for a fresh count-up effect.
  const duration = 1500;
  const range = targetValue - startValue;
  let startTime = null;

  function animation(currentTime) {
    if (startTime === null) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const progress = Math.min(timeElapsed / duration, 1);

    // Ease-out quint function for a smoother animation
    const easedProgress = 1 - Math.pow(1 - progress, 5);
    const currentValue = startValue + range * easedProgress;

    if (formatter) {
      element.textContent = formatter(currentValue);
    } else {
      element.textContent = currentValue.toFixed(decimals);
    }

    if (timeElapsed < duration) {
      requestAnimationFrame(animation);
    } else {
      if (formatter) {
        element.textContent = formatter(targetValue);
      } else {
        element.textContent = targetValue.toFixed(decimals);
      }
    }
  }

  requestAnimationFrame(animation);
}

/**
 * Toggles a loading state on a button.
 * @param {HTMLElement} button The button element.
 * @param {boolean} isLoading Whether to show the loading state.
 */
export function setLoading(button, isLoading) {
  if (!button) return;
  button.classList.toggle('loading', isLoading);
  button.disabled = isLoading;
}

/**
 * Shows a message inside the authentication form area.
 * @param {string} text The message to display.
 * @param {'info'|'success'|'error'} type The type of message.
 */
export function showInlineAuthMessage(text, type = 'info') {
  const messageEl = document.getElementById('authMessage');
  if (!messageEl) return;

  messageEl.textContent = text;
  messageEl.classList.remove('info', 'success', 'error');
  messageEl.classList.add(type, 'show');
}

/**
 * Clears any message shown inside the authentication form area.
 */
export function clearInlineAuthMessage() {
  const messageEl = document.getElementById('authMessage');
  if (!messageEl) return;

  messageEl.classList.remove('show');
  // Optional: Clear text after a short delay to allow for fade-out animations if you add them
  setTimeout(() => {
    if (!messageEl.classList.contains('show')) {
      messageEl.textContent = '';
    }
  }, 300);
}

/**
 * Attaches global UI event handlers, e.g., for closing modals.
 */
export function attachGlobalUiHandlers() {
  // Click outside a modal to close it
  window.addEventListener('click', (event) => {
    // This handles the legacy edit hours modal
    const editHoursModal = document.getElementById('editHoursModal');
    if (editHoursModal && event.target === editHoursModal) {
      if (window.closeEditModal) {
        window.closeEditModal();
      }
    }

    // This can be expanded for other modals
    const approvalsModal = document.getElementById('approvalsModal');
    if (approvalsModal && event.target === approvalsModal) {
      approvalsModal.style.display = 'none';
    }
  });

  // Press Escape key to close modals
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && window.closeEditModal) {
      window.closeEditModal();
    }
  });
}

/**
 * Applies a staggered "roll-in" animation to a list of elements.
 * This should be called each time the view containing the list becomes active.
 * @param {string} selector A CSS selector for the items to animate (e.g., 'tbody tr').
 */
export function triggerListAnimation(selector) {
  const items = document.querySelectorAll(selector);
  if (!items.length) return;

  // Hide all items initially to prevent a flash of content before the animation starts.
  items.forEach((item, index) => {
    item.style.opacity = '0';
    item.classList.remove('animate-roll-in');
  });

  // Stagger the animation for each item.
  items.forEach((item, index) => {
    item.style.animationDelay = `${index * 50}ms`;
    // Use requestAnimationFrame to ensure the animation class is added on the next paint cycle.
    requestAnimationFrame(() => item.classList.add('animate-roll-in'));
  });
}