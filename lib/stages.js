/**
 * Stage presets dùng chung cho tất cả test files.
 *
 * Mặc định chạy FULL. Dùng QUICK=true để chạy nhanh:
 *   k6 run -e QUICK=true tests/luong-01/load.js
 *   QUICK=true bash tests/luong-01/run-all.sh
 *
 * So sánh thời gian:
 *   smoke  : 10s        → 10s        (không đổi)
 *   load   : ~20m       → ~3m
 *   stress : ~22m       → ~6m
 *   spike  : ~3m        → ~3m        (không đổi)
 *   soak   : ~2h10m     → ~10m
 */

const QUICK = __ENV.QUICK !== 'false';  // mặc định true, tắt bằng QUICK=false

export const stages = {
  load: QUICK
    ? [
        { duration: '30s', target: 20 },  // ramp up
        { duration: '2m',  target: 20 },  // steady state
        { duration: '30s', target: 0  },  // ramp down
      ]
    : [
        { duration: '2m',  target: 20 },
        { duration: '15m', target: 20 },
        { duration: '3m',  target: 0  },
      ],

  stress: QUICK
    ? [
        { duration: '1m', target: 20  },
        { duration: '1m', target: 50  },
        { duration: '2m', target: 100 },
        { duration: '1m', target: 200 },
        { duration: '1m', target: 0   },
      ]
    : [
        { duration: '2m', target: 20  },
        { duration: '5m', target: 50  },
        { duration: '5m', target: 100 },
        { duration: '5m', target: 200 },
        { duration: '5m', target: 0   },
      ],

  spike: [
    { duration: '30s', target: 5   },
    { duration: '30s', target: 100 },
    { duration: '1m',  target: 100 },
    { duration: '30s', target: 5   },
    { duration: '30s', target: 0   },
  ],

  soak: QUICK
    ? [
        { duration: '2m', target: 20 },
        { duration: '6m', target: 20 },
        { duration: '2m', target: 0  },
      ]
    : [
        { duration: '5m', target: 20 },
        { duration: '2h', target: 20 },
        { duration: '5m', target: 0  },
      ],
};
