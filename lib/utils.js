import { sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export { randomIntBetween };

/** Sleep một số giây ngẫu nhiên giữa min và max. */
export function randomSleep(min = 1, max = 3) {
  sleep(randomIntBetween(min, max));
}

/** Chọn user từ mảng theo VU index (round-robin). */
export function getUser(users) {
  return users[__VU % users.length];
}

/** Chọn user theo role, round-robin theo VU index. */
export function getUserByRole(users, role) {
  const filtered = users.filter((u) => u.role === role);
  if (filtered.length === 0) return users[__VU % users.length];
  return filtered[__VU % filtered.length];
}
