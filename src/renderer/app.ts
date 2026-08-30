const status = document.querySelector<HTMLElement>('#status');

if (status) {
  const hasNodeGlobals = 'process' in globalThis || 'require' in globalThis;
  status.textContent = hasNodeGlobals
    ? 'Unsafe renderer globals detected.'
    : 'Product shell ready.';
}
