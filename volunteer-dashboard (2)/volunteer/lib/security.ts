const isLocalhost = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

export const enforceClientSecurity = () => {
  if (typeof window === 'undefined') return;

  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = window.self.location.href;
    }
  } catch {
    window.self.location.href = window.location.href;
  }

  if (window.location.protocol !== 'https:' && !isLocalhost(window.location.hostname)) {
    const { host, pathname, search, hash } = window.location;
    window.location.replace(`https://${host}${pathname}${search}${hash}`);
  }
};
