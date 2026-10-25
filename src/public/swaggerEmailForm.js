(function configureEmailSendForm() {
  const SEND_PATH = '/api/v1/email/send';
  const ALWAYS_VISIBLE = ['template', 'provider', 'dryRun'];
  let templateFields = null;
  let updateQueued = false;

  function findSendBlock() {
    return Array.from(document.querySelectorAll('.opblock')).find(block => {
      const path = block.querySelector('.opblock-summary-path');
      const method = block.querySelector('.opblock-summary-method');
      return path && method &&
        path.textContent.trim() === SEND_PATH &&
        method.textContent.trim().toUpperCase() === 'POST';
    });
  }

  function fieldName(row) {
    const label = row.querySelector('.parameter__name');
    return label ? label.textContent.trim().split(/\s+/)[0] : '';
  }

  function updateControlValue(control, value) {
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

    if (descriptor && descriptor.set) descriptor.set.call(control, value);
    else control.value = value;

    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function updateCheckboxValue(control, checked) {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'checked'
    );

    if (descriptor && descriptor.set) descriptor.set.call(control, checked);
    else control.checked = checked;

    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function clearHiddenControl(control) {
    if (control instanceof HTMLButtonElement) return;

    if (control.type === 'checkbox' || control.type === 'radio') {
      if (control.dataset.guardianEmailChecked === undefined) {
        control.dataset.guardianEmailChecked = String(control.checked);
      }
      updateCheckboxValue(control, false);
      return;
    }

    if (control.dataset.guardianEmailValue === undefined) {
      control.dataset.guardianEmailValue = control.value;
    }
    if (control.value !== '') updateControlValue(control, '');
  }

  function restoreVisibleControl(control) {
    if (control.dataset.guardianEmailValue !== undefined) {
      const value = control.dataset.guardianEmailValue;
      delete control.dataset.guardianEmailValue;
      updateControlValue(control, value);
    }

    if (control.dataset.guardianEmailChecked !== undefined) {
      const checked = control.dataset.guardianEmailChecked === 'true';
      delete control.dataset.guardianEmailChecked;
      updateCheckboxValue(control, checked);
    }
  }

  function setRowActive(row, active) {
    row.hidden = !active;

    // Swagger keeps example values in every generated input, including rows
    // hidden by this helper. Clear hidden values as well as disabling their
    // controls so Swagger's internal form state cannot submit stale examples.
    row.querySelectorAll('input, select, textarea, button').forEach(control => {
      if (!active && !control.disabled) {
        clearHiddenControl(control);
        control.disabled = true;
        control.dataset.guardianEmailDisabled = 'true';
      } else if (active && control.dataset.guardianEmailDisabled === 'true') {
        control.disabled = false;
        delete control.dataset.guardianEmailDisabled;
        restoreVisibleControl(control);
      }
    });
  }

  function updateVisibleFields() {
    updateQueued = false;
    if (!templateFields) return;

    const block = findSendBlock();
    if (!block) return;

    const rows = Array.from(block.querySelectorAll('tr'));
    const templateRow = rows.find(row => fieldName(row) === 'template');
    const templateSelect = templateRow && templateRow.querySelector('select');
    if (!templateSelect) return;

    if (!templateSelect.dataset.guardianEmailListener) {
      templateSelect.dataset.guardianEmailListener = 'true';
      templateSelect.addEventListener('change', queueUpdate);
    }

    const allowed = new Set([
      ...ALWAYS_VISIBLE,
      ...(templateFields[templateSelect.value] || [])
    ]);

    rows.forEach(row => {
      const name = fieldName(row);
      if (!name) return;
      setRowActive(row, allowed.has(name));
    });
  }

  function queueUpdate() {
    if (updateQueued) return;
    updateQueued = true;
    window.setTimeout(updateVisibleFields, 0);
  }

  function filterSendRequest(request) {
    if (!request || !request.url || !request.url.endsWith(SEND_PATH)) {
      return request;
    }

    const body = request.body;
    if (!(body instanceof FormData) || !templateFields) return request;

    const template = body.get('template');
    const allowed = new Set([
      ...ALWAYS_VISIBLE,
      ...(templateFields[template] || [])
    ]);

    Array.from(new Set(body.keys())).forEach(name => {
      if (!allowed.has(name)) body.delete(name);
    });

    return request;
  }

  function installRequestInterceptor() {
    if (!window.ui || !window.ui.getConfigs) return false;

    const config = window.ui.getConfigs();
    const existing = config.requestInterceptor;
    if (existing && existing.guardianEmailFilter) return true;

    const interceptor = async request => {
      const nextRequest = existing ? await existing(request) : request;
      return filterSendRequest(nextRequest);
    };
    interceptor.guardianEmailFilter = true;
    config.requestInterceptor = interceptor;
    return true;
  }

  fetch('/openapi.json')
    .then(response => response.json())
    .then(spec => {
      const operation = spec.paths && spec.paths[SEND_PATH] && spec.paths[SEND_PATH].post;
      templateFields = operation && operation['x-guardian-template-fields'];
      if (!installRequestInterceptor()) {
        const timer = window.setInterval(() => {
          if (installRequestInterceptor()) window.clearInterval(timer);
        }, 100);
      }
      queueUpdate();
    })
    .catch(() => {
      // Swagger remains fully usable if the optional display helper cannot load.
    });

  new MutationObserver(queueUpdate).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
