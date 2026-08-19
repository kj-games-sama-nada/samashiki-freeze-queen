(function () {
  "use strict";

  // ゲームの調整値。画像差し替え時もtexture keyとフレーム配置を維持する。
  window.GAME_SETTINGS = Object.freeze({
    width: 640,
    height: 360,
    tileSize: 32,
    difficulty: {
      defaultId: "normal",
      options: {
        easy: {
          id: "easy",
          label: "やさしい",
          playerLife: 7,
          description: "ライフ7。初めて遊ぶ人やステージ練習向け。"
        },
        normal: {
          id: "normal",
          label: "ふつう",
          playerLife: 5,
          description: "ライフ5。現在の標準バランスで遊びます。"
        },
        hard: {
          id: "hard",
          label: "むずかしい",
          playerLife: 3,
          description: "ライフ3。回避と攻撃の判断が重要になります。"
        }
      }
    },
    player: {
      speed: 150,
      life: 5,
      startDirection: "down",
      damageResponse: {
        invincibilityMs: 1000,
        knockbackSpeed: 240,
        knockbackDurationMs: 220,
        blinkIntervalMs: 70
      },
      spriteSheet: {
        path: "assets/images/sama.png?v=character-restore-1",
        frameWidth: 32,
        frameHeight: 32,
        columns: 4,
        rows: 4,
        animationFrameRate: 8,
        directionStartFrames: { down: 0, left: 4, right: 8, up: 12 }
      },
      hitbox: { width: 20, height: 24, offsetX: 6, offsetY: 7 }
    },
    enemy: {
      life: 5,
      contactDamage: 1,
      contactCooldownMs: 1000,
      speed: 68,
      aggroRange: 560,
      stopDistance: 20,
      hitboxRadius: 13,
      dash: {
        firstDelayMs: 1600,
        durationMs: 520,
        minDistance: 72,
        stunMs: 950,
        chainGapMs: 180,
        hitRecoveryMs: 420,
        warningLength: 156,
        phases: [
          { minLife: 4, chaseSpeed: 68, cooldownMs: 2800, warningMs: 650, speed: 220, count: 1 },
          { minLife: 2, chaseSpeed: 82, cooldownMs: 2200, warningMs: 500, speed: 250, count: 1 },
          { minLife: 1, chaseSpeed: 96, cooldownMs: 1700, warningMs: 360, speed: 280, count: 2 }
        ]
      },
      spriteSheet: {
        path: "assets/images/enemy.png?v=character-restore-1",
        frameWidth: 32,
        frameHeight: 32,
        columns: 4,
        rows: 4,
        animationFrameRate: 7,
        directionStartFrames: { down: 0, left: 4, right: 8, up: 12 }
      },
      frozenSpriteSheet: {
        path: "assets/images/ice-statue.png?v=character-restore-1",
        frameWidth: 32,
        frameHeight: 32,
        columns: 4,
        rows: 4,
        directionStartFrames: { down: 0, left: 4, right: 8, up: 12 }
      }
    },
    attack: {
      speed: 300,
      range: 96,
      cooldownMs: 280,
      size: 12,
      spawnOffset: 10,
      damage: 1,
      texture: { path: "assets/images/freeze-shot.png?v=character-restore-1", width: 16, height: 16 }
    },
    special: {
      maxGauge: 100,
      gainPerHit: 20,
      gainOnDamage: 10,
      damage: 2,
      radius: 560,
      ringColor: 0xc9f8ff,
      coreColor: 0x65ddff,
      treeEffect: {
        centerX: 320,
        centerY: 178,
        enterMs: 190,
        holdMs: 390,
        exitMs: 250,
        backdropWidth: 292,
        backdropHeight: 300,
        rowHeight: 14,
        rows: [
          [-100, 34], [-86, 52], [-72, 72], [-58, 94],
          [-44, 66], [-30, 90], [-16, 116], [-2, 140],
          [12, 94], [26, 124], [40, 154], [54, 184],
          [68, 126], [82, 166], [96, 208], [110, 242]
        ],
        snowRows: [1, 4, 8, 12],
        treeColors: [0x126c71, 0x158a82, 0x1da99b],
        treeOutlineColor: 0x08394d,
        snowColor: 0xcffaff,
        snowShadowColor: 0x68d5e6,
        trunkColor: 0x83556a,
        trunkOutlineColor: 0x3c3150,
        starColor: 0xffe36e,
        starCoreColor: 0xffffd6,
        glowColor: 0x54eaff,
        ornamentColors: [0xff6f91, 0xffd75e, 0xb691ff, 0x6fffd2],
        ornaments: [
          [-18, -78], [25, -61], [-34, -37], [38, -19], [-58, 2],
          [4, 17], [64, 33], [-78, 50], [-21, 64], [37, 77], [86, 94]
        ],
        lightColors: [0xffffff, 0x79f4ff, 0xfff29b],
        lights: [
          [0, -91], [-30, -51], [14, -46], [48, -5], [-16, -2],
          [-63, 29], [28, 35], [76, 61], [-39, 74], [7, 91], [-100, 105]
        ],
        snowflakes: [
          [-250, -116], [-206, -38], [-168, 94], [-116, -132], [-72, 126],
          [82, -126], [126, 112], [174, -70], [218, 34], [252, -108],
          [-282, 38], [282, 92]
        ]
      }
    },
    items: {
      shineMuscat: {
        textureKey: "shine-muscat",
        width: 24,
        height: 24,
        heal: 2,
        hitboxRadius: 9,
        bobDistance: 3,
        bobDurationMs: 620
      }
    },
    audio: {
      enabledByDefault: true,
      masterVolume: 0.24,
      music: {
        path: "assets/audio/ave-maria-schubert-vocal.mp3",
        volume: 0.15,
        loop: true,
        preload: "auto",
        startOffsetSeconds: 18
      },
      attackMs: 8,
      releaseMs: 28,
      sounds: {
        shot: {
          notes: [
            { frequency: 920, endFrequency: 470, durationMs: 85, wave: "square", volume: 0.28 }
          ]
        },
        hit: {
          notes: [
            { frequency: 310, endFrequency: 190, durationMs: 70, wave: "square", volume: 0.24 },
            { offsetMs: 38, frequency: 760, endFrequency: 540, durationMs: 65, wave: "triangle", volume: 0.18 }
          ]
        },
        freeze: {
          notes: [
            { frequency: 440, endFrequency: 880, durationMs: 150, wave: "triangle", volume: 0.25 },
            { offsetMs: 80, frequency: 660, endFrequency: 1320, durationMs: 210, wave: "sine", volume: 0.24 },
            { offsetMs: 170, frequency: 1040, endFrequency: 1560, durationMs: 180, wave: "square", volume: 0.12 }
          ]
        },
        damage: {
          notes: [
            { frequency: 180, endFrequency: 75, durationMs: 220, wave: "sawtooth", volume: 0.30 }
          ]
        },
        pickup: {
          notes: [
            { frequency: 660, durationMs: 90, wave: "square", volume: 0.20 },
            { offsetMs: 75, frequency: 880, durationMs: 95, wave: "square", volume: 0.22 },
            { offsetMs: 150, frequency: 1320, durationMs: 145, wave: "triangle", volume: 0.23 }
          ]
        },
        special: {
          notes: [
            { frequency: 196, endFrequency: 392, durationMs: 400, wave: "sawtooth", volume: 0.18 },
            { offsetMs: 75, frequency: 523, durationMs: 250, wave: "square", volume: 0.18 },
            { offsetMs: 150, frequency: 659, durationMs: 260, wave: "square", volume: 0.17 },
            { offsetMs: 225, frequency: 784, endFrequency: 1568, durationMs: 420, wave: "triangle", volume: 0.24 }
          ]
        },
        clear: {
          notes: [
            { frequency: 523, durationMs: 130, wave: "square", volume: 0.20 },
            { offsetMs: 120, frequency: 659, durationMs: 130, wave: "square", volume: 0.20 },
            { offsetMs: 240, frequency: 784, durationMs: 150, wave: "square", volume: 0.21 },
            { offsetMs: 375, frequency: 1047, durationMs: 360, wave: "triangle", volume: 0.25 }
          ]
        },
        gameover: {
          notes: [
            { frequency: 330, durationMs: 180, wave: "triangle", volume: 0.23 },
            { offsetMs: 150, frequency: 247, durationMs: 210, wave: "triangle", volume: 0.23 },
            { offsetMs: 330, frequency: 165, endFrequency: 82, durationMs: 430, wave: "sawtooth", volume: 0.25 }
          ]
        }
      }
    },
    effects: {
      shadow: { width: 24, height: 8, offsetY: 13, alpha: 0.34 },
      enemyLifeBar: { width: 30, height: 4, offsetY: -22 },
      freezeTints: [0xc9f6ff, 0xa5edff, 0x7fdfff, 0x5acbff],
      burst: { shardCount: 6, distance: 18, durationMs: 180, shardSize: 3 },
      damageShake: { durationMs: 70, intensity: 0.003 },
      dashWarning: { wideColor: 0xff4f7d, coreColor: 0xffd2de, markerColor: 0xffffff },
      stunBurst: { color: 0xffe179, alpha: 0.95 },
      freezeReveal: { delayMs: 1200, popDurationMs: 220, startScale: 0.72 }
    },
    stages: [
      {
        id: 1,
        name: "STAGE 1",
        playerStart: { x: 112, y: 180 },
        wallRects: [
          [0, 0, 640, 32], [0, 328, 640, 32], [0, 0, 32, 360], [608, 0, 32, 360],
          [288, 64, 64, 96], [288, 232, 64, 96],
          [64, 64, 128, 32], [448, 264, 128, 32]
        ],
        floorDetails: [
          [3, 4, "spark"], [7, 6, "chip"], [11, 3, "spark"], [16, 6, "chip"],
          [5, 8, "chip"], [12, 9, "spark"], [17, 4, "spark"], [9, 5, "chip"],
          [2, 7, "frost"], [6, 3, "frost"], [13, 5, "frost"], [15, 9, "frost"],
          [4, 9, "spark"], [18, 7, "chip"]
        ],
        enemies: [
          { x: 480, y: 180, direction: "left", tint: null, dashDelayOffsetMs: 0 }
        ],
        pickups: []
      },
      {
        id: 2,
        name: "STAGE 2",
        playerStart: { x: 96, y: 180 },
        wallRects: [
          [0, 0, 640, 32], [0, 328, 640, 32], [0, 0, 32, 360], [608, 0, 32, 360],
          [160, 64, 32, 96], [160, 224, 32, 104],
          [320, 32, 32, 96], [320, 192, 32, 136],
          [448, 128, 128, 32], [64, 256, 64, 32]
        ],
        floorDetails: [
          [2, 3, "frost"], [4, 5, "spark"], [7, 3, "chip"], [9, 8, "spark"],
          [12, 4, "frost"], [14, 7, "chip"], [17, 3, "spark"], [18, 8, "frost"],
          [5, 9, "chip"], [8, 6, "frost"], [11, 5, "spark"], [15, 9, "spark"]
        ],
        enemies: [
          { x: 496, y: 88, direction: "left", tint: 0xffb6db, dashDelayOffsetMs: 0, wakeDelayMs: 0 },
          { x: 512, y: 248, direction: "left", tint: 0xb8ffd2, dashDelayOffsetMs: 900, wakeDelayMs: 6000 }
        ],
        pickups: [
          { type: "shineMuscat", x: 144, y: 176 }
        ]
      },
      {
        id: 3,
        name: "STAGE 3",
        finalTitle: "ALL STAGES CLEAR",
        lastEnemyCooldownMultiplier: 0.82,
        playerStart: { x: 96, y: 180 },
        wallRects: [
          [0, 0, 640, 32], [0, 328, 640, 32], [0, 0, 32, 360], [608, 0, 32, 360],
          [224, 64, 64, 64], [224, 232, 64, 64],
          [384, 64, 64, 64], [384, 232, 64, 64],
          [96, 80, 64, 32], [480, 224, 64, 32]
        ],
        floorDetails: [
          [2, 4, "spark"], [4, 7, "frost"], [6, 3, "chip"], [8, 6, "spark"],
          [10, 4, "frost"], [12, 6, "chip"], [14, 3, "spark"], [16, 5, "frost"],
          [18, 8, "spark"], [5, 9, "chip"], [9, 8, "frost"], [13, 9, "spark"],
          [17, 7, "chip"], [11, 5, "spark"]
        ],
        enemies: [
          { x: 528, y: 88, direction: "left", tint: 0xff9fc7, dashDelayOffsetMs: 0, wakeDelayMs: 0 },
          { x: 520, y: 180, direction: "left", tint: 0x9fffd0, dashDelayOffsetMs: 700, wakeDelayMs: 5000 },
          { x: 528, y: 288, direction: "left", tint: 0xc7a7ff, dashDelayOffsetMs: 1200, wakeDelayMs: 11000 }
        ],
        pickups: [
          { type: "shineMuscat", x: 336, y: 180 }
        ]
      }
    ],
    colors: {
      floorA: 0x142b49,
      floorB: 0x183451,
      floorGrid: 0x2a4d6b,
      floorGlow: 0x4d7894,
      floorSparkle: 0x8ed8e8,
      wallShadow: 0x08192d,
      wall: 0x476d87,
      wallFace: 0x31546d,
      wallTop: 0x9ed8e5,
      wallShine: 0xe1fbff,
      ice: 0x9beaff
    }
  });
}());
