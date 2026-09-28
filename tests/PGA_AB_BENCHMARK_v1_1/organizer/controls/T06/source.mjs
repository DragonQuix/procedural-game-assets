// Editable legacy recipe. No Studio imports or semantic editing service.
export function build(api) {
  const spec = {
  "id": "field-guard",
  "seed": 42,
  "frame": {
    "w": 40,
    "h": 46,
    "feetY": 44,
    "bodyX": 20
  },
  "palette": {
    "A": "#8a4b26",
    "a": "#5e3018",
    "V": "#d4933e",
    "E": "#f5d79a",
    "k": "#241812",
    "K": "#7a4a24",
    "L": "#a86a34",
    "G": "#7a4a24",
    "g": "#5e3a1c",
    "B": "#33261c",
    "b": "#4a382a",
    "Y": "#c98f3f",
    "y": "#8a5f26",
    "P": "#46352a",
    "p": "#2e2118",
    "q": "#6b5442",
    "t": "#3d2b1a",
    "T": "#5a4028",
    "C": "#241a12",
    "m": "#3a3226",
    "M": "#6b5e4a",
    "W": "#e8ddc0",
    "O": "#ff9a3d"
  },
  "art": {
    "head": [
      "..AAAA..",
      ".AAAAAa.",
      "AAAAAAAA",
      "AAVVVVEk",
      "AAAVVVkk",
      ".AAkkkkk",
      "..kkkk.."
    ],
    "torso": [
      "BB.........",
      "BBbKKKKKKK.",
      "BBKKKKLLLKk",
      "BbKKKLLKKKk",
      ".bKKKYKKKKk",
      ".bKKKKKKKk.",
      "..KKKKKKk..",
      "..kKKKKk...",
      "..yYYYYYy.."
    ]
  },
  "rig": {
    "hipY": -11,
    "hipSpread": 2,
    "shoulderBack": [
      -5,
      -16
    ],
    "shoulderFront": [
      5,
      -16
    ],
    "thigh": 4,
    "shin": 4,
    "thick": 4,
    "heavyGun": true,
    "torsoDrop": 1,
    "guns": {
      "fwd": {
        "grip": [
          7,
          -14
        ],
        "dir": [
          1,
          0
        ],
        "back": 3,
        "len": 7
      },
      "diagUp": {
        "grip": [
          6,
          -16
        ],
        "dir": [
          0.7071067811865476,
          -0.7071067811865476
        ],
        "back": 3,
        "len": 7
      },
      "up": {
        "grip": [
          4,
          -15
        ],
        "dir": [
          0,
          -1
        ],
        "back": 3,
        "len": 9
      },
      "diagDown": {
        "grip": [
          6,
          -12
        ],
        "dir": [
          0.7071067811865476,
          0.7071067811865476
        ],
        "back": 3,
        "len": 7
      },
      "down": {
        "grip": [
          4,
          -11
        ],
        "dir": [
          0,
          1
        ],
        "back": 3,
        "len": 6
      }
    },
    "proneMuzzle": [
      17,
      -4
    ],
    "ballCenterY": -11
  },
  "poses": [
    {
      "id": "stand_fwd",
      "kind": "rig",
      "legs": [
        [
          -9,
          3
        ],
        [
          11,
          5
        ]
      ],
      "aim": "fwd"
    },
    {
      "id": "run0_fwd",
      "kind": "rig",
      "legs": [
        [
          -28,
          12
        ],
        [
          32,
          10
        ]
      ],
      "aim": "fwd"
    },
    {
      "id": "run1_fwd",
      "kind": "rig",
      "legs": [
        [
          -14,
          78
        ],
        [
          18,
          38
        ]
      ],
      "aim": "fwd"
    },
    {
      "id": "run2_fwd",
      "kind": "rig",
      "legs": [
        [
          20,
          72
        ],
        [
          -4,
          22
        ]
      ],
      "aim": "fwd"
    },
    {
      "id": "run3_fwd",
      "kind": "rig",
      "legs": [
        [
          32,
          10
        ],
        [
          -28,
          12
        ]
      ],
      "aim": "fwd"
    },
    {
      "id": "run4_fwd",
      "kind": "rig",
      "legs": [
        [
          18,
          38
        ],
        [
          -14,
          78
        ]
      ],
      "aim": "fwd"
    },
    {
      "id": "run5_fwd",
      "kind": "rig",
      "legs": [
        [
          -4,
          22
        ],
        [
          20,
          72
        ]
      ],
      "aim": "fwd"
    }
  ],
  "clips": {
    "stand_fwd": {
      "frames": [
        "stand_fwd"
      ],
      "ms": 1000
    },
    "run_fwd": {
      "frames": [
        "run0_fwd",
        "run1_fwd",
        "run2_fwd",
        "run3_fwd",
        "run4_fwd",
        "run5_fwd"
      ],
      "ms": 110
    }
  },
  "kind": "humanoid"
};
  return api.bakeHumanoid(spec);
}
