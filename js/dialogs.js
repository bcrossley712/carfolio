// ============================================================================
// dialogs.js — replaces native alert()/confirm() with modals styled to match
// the rest of the app, per preference. Both return Promises so call sites
// can `await` them just like the native versions (minus the frozen-tab feel).
// ============================================================================

const modalRoot = () => document.getElementById('modal-root');

function open(innerHTML) {
  modalRoot().innerHTML = `
    <div class="modal-backdrop" id="dialog-backdrop">
      <div class="modal modal-small" role="alertdialog" aria-modal="true">${innerHTML}</div>
    </div>
  `;
}

function close() {
  modalRoot().innerHTML = '';
}

export function confirmDialog(message, { title = 'Are you sure?', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    open(`
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
      </div>
      <p class="dialog-message">${message}</p>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="dialog-cancel">${cancelText}</button>
        <button type="button" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" id="dialog-confirm">${confirmText}</button>
      </div>
    `);

    const cleanup = (result) => {
      close();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    };

    document.getElementById('dialog-confirm').addEventListener('click', () => cleanup(true));
    document.getElementById('dialog-cancel').addEventListener('click', () => cleanup(false));
    document.getElementById('dialog-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'dialog-backdrop') cleanup(false);
    });
    document.addEventListener('keydown', onKey);
    document.getElementById('dialog-confirm').focus();
  });
}

export function alertDialog(message, { title = 'Heads up', buttonText = 'OK' } = {}) {
  return new Promise((resolve) => {
    open(`
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
      </div>
      <p class="dialog-message">${message}</p>
      <div class="modal-footer">
        <button type="button" class="btn btn-primary" id="dialog-ok">${buttonText}</button>
      </div>
    `);

    const cleanup = () => {
      close();
      document.removeEventListener('keydown', onKey);
      resolve();
    };
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') cleanup();
    };

    document.getElementById('dialog-ok').addEventListener('click', cleanup);
    document.getElementById('dialog-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'dialog-backdrop') cleanup();
    });
    document.addEventListener('keydown', onKey);
    document.getElementById('dialog-ok').focus();
  });
}
