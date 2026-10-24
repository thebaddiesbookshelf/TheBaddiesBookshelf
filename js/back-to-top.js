
/* ==========================================
   TBB 2.0 — BACK TO TOP™
   Global floating scroll button
   ========================================== */

(() => {
  'use strict';

  function initializeBackToTop() {
    if (document.getElementById('tbbBackToTop')) return;

    const button = document.createElement('button');

    button.id = 'tbbBackToTop';
    button.type = 'button';
    button.setAttribute('aria-label', 'Scroll back to top');
    button.setAttribute('title', 'Back to Top 💗');
    button.textContent = '↑';

    document.body.appendChild(button);

    const style = document.createElement('style');

    style.textContent = `
      #tbbBackToTop {
        position: fixed;
        right: max(20px, env(safe-area-inset-right));
        bottom: max(22px, env(safe-area-inset-bottom));
        width: 52px;
        height: 52px;
        border-radius: 50%;
        border: 2px solid #ffb4df;
        background: linear-gradient(135deg, #ff4db5, #b91b80);
        color: #ffffff;
        font-size: 29px;
        font-weight: 800;
        line-height: 1;
        display: grid;
        place-items: center;
        cursor: pointer;
        box-shadow: 0 8px 25px rgba(255, 45, 166, 0.35);
        z-index: 9999;

        opacity: 0;
        visibility: hidden;
        transform: translateY(15px);
        pointer-events: none;

        transition:
          opacity 0.25s ease,
          transform 0.25s ease,
          visibility 0.25s ease;
      }

      #tbbBackToTop.tbb-visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
        pointer-events: auto;
      }

      #tbbBackToTop:hover {
        background: linear-gradient(135deg, #ff80cc, #d12c96);
        transform: translateY(-4px);
      }

      #tbbBackToTop:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 4px;
      }

      @media (max-width: 600px) {
        #tbbBackToTop {
          right: max(14px, env(safe-area-inset-right));
          bottom: max(16px, env(safe-area-inset-bottom));
          width: 46px;
          height: 46px;
          font-size: 25px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #tbbBackToTop {
          transition: none;
        }
      }
    `;

    document.head.appendChild(style);

    function updateVisibility() {
      button.classList.toggle(
        'tbb-visible',
        window.scrollY > 300
      );
    }

    button.addEventListener('click', () => {
      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      window.scrollTo({
        top: 0,
        behavior: reducedMotion ? 'instant' : 'smooth'
      });
    });

    window.addEventListener('scroll', updateVisibility, {
      passive: true
    });

    updateVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initializeBackToTop,
      { once: true }
    );
  } else {
    initializeBackToTop();
  }
})();
