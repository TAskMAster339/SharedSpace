import { ApiError } from '../api/client';
import { releaseOfficeLease, renewOfficeLease } from '../api/documents';

const heartbeatInterval = 60_000;
const leaseTimeout = 5 * heartbeatInterval;

export function trackOfficeLease(id: string, onExpired: () => void) {
  const controller = new AbortController();
  let renewing = false;
  let expiry = window.setTimeout(expire, leaseTimeout);

  function close() {
    if (controller.signal.aborted) return;
    controller.abort();
    window.clearInterval(timer);
    window.clearTimeout(expiry);
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    void releaseOfficeLease(id).catch(() => {});
  }

  function expire() {
    close();
    onExpired();
  }

  async function renew() {
    if (renewing || controller.signal.aborted) return;
    renewing = true;
    try {
      await renewOfficeLease(id, controller.signal);
      if (!controller.signal.aborted) {
        window.clearTimeout(expiry);
        expiry = window.setTimeout(expire, leaseTimeout);
      }
    } catch (err) {
      if (
        !controller.signal.aborted &&
        err instanceof ApiError &&
        err.code === 'office_lease_expired'
      ) {
        expire();
      }
    } finally {
      renewing = false;
    }
  }

  function onPageHide(event: PageTransitionEvent) {
    if (!event.persisted) close();
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') void renew();
  }

  const timer = window.setInterval(() => void renew(), heartbeatInterval);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);
  return close;
}
