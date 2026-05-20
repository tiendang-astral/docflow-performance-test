/**
 * Stage presets dùng chung cho tất cả test files.
 *
 * Mặc định chạy FULL. Dùng QUICK=true để chạy nhanh:
 *   k6 run -e QUICK=true tests/admin/stress.js
 *
 * So sánh thời gian:
 *   stress : ~22m → ~6m
 */

const MAX_VU = __ENV.MAX_VU ? parseInt(__ENV.MAX_VU, 10) : 0;

export const stages = {
  // Khi MAX_VU được truyền qua -e MAX_VU=N: ramp 20s → hold 1m → ramp down 20s
  stress: MAX_VU
    ? [
        { duration: '20s', target: MAX_VU },
        { duration: '1m',  target: MAX_VU },
        { duration: '20s', target: 0       },
      ]
    : [
        { duration: '2m', target: 20  },
        { duration: '5m', target: 50  },
        { duration: '5m', target: 100 },
        { duration: '5m', target: 200 },
        { duration: '5m', target: 0   },
      ],
};
