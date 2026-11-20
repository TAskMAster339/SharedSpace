(() => {
  if (window.parent === window || !document.referrer) return;

  const parentOrigin = new URL(document.referrer).origin;
  if (parentOrigin === 'null') return;

  const messageType = 'sharedspace-office-theme';
  const themeIdPattern = /^theme-[a-z0-9_-]{1,64}$/i;
  const themeNamePattern = /^[^<>]{1,100}$/u;
  const colorKeyPattern = /^[a-z][a-z0-9-]{0,80}$/i;
  const colorValuePattern = /^(?:#[0-9a-f]{3,8}|rgba?\([0-9.%,\s]+\))$/i;
  const builtIns = new Set([
    'theme-white', 'theme-night', 'theme-light', 'theme-dark', 'theme-system',
    'theme-classic-light', 'theme-contrast-dark', 'theme-gray',
  ]);

  async function synchronize(id) {
    if (builtIns.has(id)) {
      localStorage.removeItem('ui-theme');
    } else {
      const response = await fetch('/themes.json', { credentials: 'omit' });
      if (!response.ok) return false;
      const { themes } = await response.json();
      const theme = Array.isArray(themes) && themes.find((entry) => entry?.id === id);
      if (!theme || !['light', 'dark'].includes(theme.type) ||
          typeof theme.name !== 'string' || !themeNamePattern.test(theme.name) ||
          !theme.colors || typeof theme.colors !== 'object') return false;

      const colors = Object.fromEntries(
        Object.entries(theme.colors)
          .filter(([key, value]) => colorKeyPattern.test(key) && typeof value === 'string' && colorValuePattern.test(value))
          .map(([key, value]) => [key, `${value} !important`]),
      );
      if (!Object.keys(colors).length) return false;
      localStorage.setItem('ui-theme', JSON.stringify({ id, type: theme.type, text: theme.name, colors }));
    }

    localStorage.setItem('ui-theme-id', id);
    return true;
  }

  async function handleMessage(event) {
    if (event.source !== window.parent || event.origin !== parentOrigin ||
        event.data?.type !== messageType || typeof event.data.id !== 'string' ||
        !themeIdPattern.test(event.data.id)) return;

    const { id } = event.data;
    let ok = false;
    try {
      ok = await synchronize(id);
    } catch {
      ok = false;
    }
    window.parent.postMessage({ type: messageType, id, ok }, parentOrigin);
  }

  window.addEventListener('message', handleMessage);
})();
