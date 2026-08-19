(function () {
  "use strict";

  const S = window.GAME_SETTINGS;
  const inputState = { up: false, down: false, left: false, right: false };
  let requestAttack = false;
  let requestSpecial = false;
  let game;
  let selectedDifficultyId = S.difficulty?.defaultId || "normal";
  let activeDifficultyId = selectedDifficultyId;

  function getDifficulty(id) {
    const options = S.difficulty?.options || {};
    return options[id] || options[S.difficulty?.defaultId] || {
      id: "normal",
      label: "ふつう",
      playerLife: S.player.life,
      description: "標準バランスで遊びます。"
    };
  }

  class SynthAudio {
    constructor(settings) {
      this.settings = settings;
      this.enabled = settings.enabledByDefault;
      this.context = null;
      this.masterGain = null;
      this.sfxSupported = Boolean(window.AudioContext || window.webkitAudioContext);
      this.music = settings.music?.path ? new Audio() : null;
      this.musicAvailable = Boolean(this.music);
      this.userActivated = false;
      this.suspended = false;
      this.musicRequested = false;
      this.pendingStartOffset = false;
      this.supported = this.sfxSupported || this.musicAvailable;

      if (this.music) {
        this.music.loop = settings.music.loop !== false;
        this.music.volume = settings.music.volume;
        this.music.preload = settings.music.preload || "metadata";
        this.music.src = settings.music.path;
        this.music.id = "bgm-audio";
        this.music.hidden = true;
        this.music.setAttribute("aria-hidden", "true");
        document.body.appendChild(this.music);
        this.music.addEventListener("loadedmetadata", () => {
          if (this.pendingStartOffset) this.applyMusicStartOffset();
        });
        this.music.addEventListener("canplay", () => {
          this.updateMusicStatus("BGM 準備完了");
        });
        this.music.addEventListener("error", () => {
          this.musicAvailable = false;
          this.supported = this.sfxSupported;
          this.updateButton();
          this.updateMusicStatus("BGMなしでもゲームを開始できます");
          console.warn("BGMを読み込めなかったため、効果音のみで続行します。");
        });
        this.music.load();
      }
    }

    unlock() {
      this.userActivated = true;
      if (!this.enabled || !this.supported) return Promise.resolve(false);
      if (this.musicRequested) this.startMusic();
      if (!this.sfxSupported) return Promise.resolve(true);
      try {
        if (!this.context) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          this.context = new AudioContextClass();
          this.masterGain = this.context.createGain();
          this.masterGain.gain.setValueAtTime(this.settings.masterVolume, this.context.currentTime);
          this.masterGain.connect(this.context.destination);
        }
        const resumeResult = this.context.state === "suspended" ? this.context.resume() : Promise.resolve();
        return Promise.resolve(resumeResult).then(() => this.context.state === "running").catch(() => false);
      } catch {
        this.sfxSupported = false;
        this.supported = this.musicAvailable;
        this.updateButton();
        return Promise.resolve(this.musicAvailable);
      }
    }

    play(name) {
      const sound = this.settings.sounds[name];
      if (!this.enabled || !this.sfxSupported || !sound) return;
      this.unlock().then((ready) => {
        if (!ready || !this.enabled || !this.context) return;
        sound.notes.forEach((note) => this.playNote(note));
      });
    }

    startMusic() {
      if (!this.musicRequested || !this.music || !this.musicAvailable || !this.enabled || this.suspended) {
        return Promise.resolve(false);
      }
      if (!this.music.paused) return Promise.resolve(true);
      this.music.volume = this.settings.music.volume;
      const playResult = this.music.play();
      return Promise.resolve(playResult).then(() => true).catch(() => false);
    }

    applyMusicStartOffset() {
      if (!this.music || !this.musicAvailable) return;
      const requestedOffset = Math.max(0, Number(this.settings.music.startOffsetSeconds) || 0);
      const maxOffset = Number.isFinite(this.music.duration)
        ? Math.max(0, this.music.duration - 0.1)
        : requestedOffset;
      try {
        this.music.currentTime = Math.min(requestedOffset, maxOffset);
        this.pendingStartOffset = false;
      } catch {
        this.pendingStartOffset = true;
      }
    }

    beginMusic(restartAtConfiguredOffset = false) {
      this.musicRequested = true;
      if (restartAtConfiguredOffset) {
        this.pendingStartOffset = true;
        this.applyMusicStartOffset();
      }
      return this.unlock().then(() => this.startMusic());
    }

    prepareForTitle() {
      this.musicRequested = false;
      this.music?.pause();
      this.pendingStartOffset = true;
      this.applyMusicStartOffset();
    }

    updateMusicStatus(message) {
      const status = document.getElementById("music-status");
      if (status) status.textContent = message;
    }

    playNote(note) {
      const now = this.context.currentTime;
      const startAt = now + (note.offsetMs || 0) / 1000;
      const endAt = startAt + note.durationMs / 1000;
      const attackEnd = Math.min(endAt, startAt + this.settings.attackMs / 1000);
      const releaseStart = Math.max(attackEnd, endAt - this.settings.releaseMs / 1000);
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();

      oscillator.type = note.wave || "square";
      oscillator.frequency.setValueAtTime(note.frequency, startAt);
      if (note.endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, note.endFrequency), endAt);
      }
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, note.volume), attackEnd);
      gain.gain.setValueAtTime(Math.max(0.0001, note.volume), releaseStart);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(gain);
      gain.connect(this.masterGain);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.02);
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled) && this.supported;
      if (this.masterGain && this.context) {
        this.masterGain.gain.cancelScheduledValues(this.context.currentTime);
        this.masterGain.gain.setValueAtTime(
          this.enabled ? this.settings.masterVolume : 0,
          this.context.currentTime
        );
      }
      if (!this.enabled) {
        this.music?.pause();
      }
      this.updateButton();
      if (this.enabled) this.unlock();
    }

    setSuspended(suspended) {
      this.suspended = Boolean(suspended);
      if (this.suspended) {
        this.music?.pause();
      } else if (this.enabled && this.userActivated && this.musicRequested) {
        this.startMusic();
      }
    }

    toggle() {
      this.setEnabled(!this.enabled);
    }

    updateButton() {
      const button = document.getElementById("sound-toggle");
      if (!button) return;
      if (!this.supported) {
        button.textContent = "音 無効";
        button.disabled = true;
        button.setAttribute("aria-label", "このブラウザでは音声を再生できません");
        return;
      }
      button.disabled = false;
      button.textContent = this.enabled ? "音 ON" : "音 OFF";
      button.classList.toggle("muted", !this.enabled);
      button.setAttribute("aria-pressed", String(this.enabled));
      button.setAttribute("aria-label", this.enabled ? "BGMと効果音をオフにする" : "BGMと効果音をオンにする");
    }
  }

  const audio = new SynthAudio(S.audio);
  window.GAME_AUDIO = audio;

  function resetInputState() {
    Object.keys(inputState).forEach((key) => { inputState[key] = false; });
    requestAttack = false;
    requestSpecial = false;
    document.querySelectorAll(".pressed").forEach((element) => element.classList.remove("pressed"));
  }

  class GameScene extends Phaser.Scene {
    constructor() {
      super("phase-one");
    }

    init(data) {
      this.stageIndex = Number.isInteger(data?.stageIndex) ? data.stageIndex : 0;
      this.carrySpecialGauge = Number.isFinite(data?.specialGauge) ? data.specialGauge : 0;
      this.difficultyId = data?.difficultyId || activeDifficultyId;
      this.difficulty = getDifficulty(this.difficultyId);
      this.maxPlayerLife = this.difficulty.playerLife;
    }

    preload() {
      const playerSheet = S.player.spriteSheet;
      if (!this.textures.exists("sama")) {
        this.load.spritesheet("sama", playerSheet.path, {
          frameWidth: playerSheet.frameWidth,
          frameHeight: playerSheet.frameHeight
        });
      }

      const enemySheet = S.enemy.spriteSheet;
      if (!this.textures.exists("enemy")) {
        this.load.spritesheet("enemy", enemySheet.path, {
          frameWidth: enemySheet.frameWidth,
          frameHeight: enemySheet.frameHeight
        });
      }

      if (!this.textures.exists("ice-statue")) {
        const frozenSheet = S.enemy.frozenSpriteSheet;
        this.load.spritesheet("ice-statue", frozenSheet.path, {
          frameWidth: frozenSheet.frameWidth,
          frameHeight: frozenSheet.frameHeight
        });
      }

      if (!this.textures.exists("freeze-shot")) {
        this.load.image("freeze-shot", S.attack.texture.path);
      }
    }

    create() {
      this.stageData = S.stages[this.stageIndex] || S.stages[0];
      this.stageIndex = S.stages.indexOf(this.stageData);
      this.physics.resume();
      this.ended = false;
      this.clearing = false;
      this.playerLife = this.maxPlayerLife;
      this.specialGauge = Phaser.Math.Clamp(this.carrySpecialGauge, 0, S.special.maxGauge);
      this.lastDirection = S.player.startDirection;
      this.nextAttackAt = 0;
      this.nextContactAt = 0;
      this.playerKnockbackUntil = 0;
      this.projectiles = this.physics.add.group();
      this.enemies = this.physics.add.group();
      this.pickups = this.physics.add.group({ allowGravity: false, immovable: true });
      this.frozenStatues = [];

      this.createTextures();
      this.createSamaAnimations();
      this.createEnemyAnimations();
      this.createStage();
      this.createActors();
      this.createPickups();
      this.createInput();
      this.updateHud();
      this.hideResult();

      this.physics.add.collider(this.player, this.walls);
      this.physics.add.collider(this.enemies, this.walls, this.onEnemyWall, undefined, this);
      this.physics.add.collider(this.enemies, this.enemies);
      this.physics.add.overlap(this.player, this.enemies, this.onPlayerEnemy, undefined, this);
      this.physics.add.overlap(this.player, this.pickups, this.onPickup, undefined, this);
      this.physics.add.collider(this.projectiles, this.walls, this.onProjectileWall, undefined, this);
      this.physics.add.overlap(this.projectiles, this.enemies, this.onEnemyHit, undefined, this);
    }

    createTextures() {
      const g = this.make.graphics({ add: false });

      if (!this.hasCompleteSpriteSheet("sama", S.player.spriteSheet)) {
        if (this.textures.exists("sama")) this.textures.remove("sama");
        g.fillStyle(0x24191c).fillRect(7, 2, 18, 24).fillRect(5, 8, 4, 19).fillRect(23, 8, 4, 19);
        g.fillStyle(0x63413a).fillRect(8, 3, 16, 22).fillRect(6, 9, 3, 17).fillRect(23, 9, 3, 17);
        g.fillStyle(0xe8ad99).fillRect(10, 6, 12, 10);
        g.fillStyle(0x101118).fillRect(8, 9, 16, 6).fillRect(7, 10, 2, 3).fillRect(23, 10, 2, 3);
        g.fillStyle(0x173c8c).fillRect(7, 16, 18, 10);
        g.fillStyle(0x4286e8).fillRect(11, 17, 10, 3);
        g.fillStyle(0x8fb7d0).fillRect(10, 25, 5, 5).fillRect(17, 25, 5, 5);
        g.fillStyle(0xcbebf0).fillRect(9, 30, 7, 2).fillRect(16, 30, 7, 2);
        g.generateTexture("sama", 32, 32);
        g.clear();
      }
      this.usesSamaSpriteSheet = this.hasCompleteSpriteSheet("sama", S.player.spriteSheet);

      if (!this.hasCompleteSpriteSheet("enemy", S.enemy.spriteSheet)) {
        if (this.textures.exists("enemy")) this.textures.remove("enemy");
        g.fillStyle(0x552f68).fillRect(5, 6, 22, 21);
        g.fillStyle(0xd95b7d).fillRect(8, 9, 16, 16);
        g.fillStyle(0xffd2bd).fillRect(10, 11, 12, 8);
        g.fillStyle(0x371e4a).fillRect(11, 14, 3, 3).fillRect(19, 14, 3, 3);
        g.generateTexture("enemy", 32, 32);
        g.clear();
      }
      this.usesEnemySpriteSheet = this.hasCompleteSpriteSheet("enemy", S.enemy.spriteSheet);

      if (!this.hasCompleteSpriteSheet("ice-statue", S.enemy.frozenSpriteSheet)) {
        if (this.textures.exists("ice-statue")) this.textures.remove("ice-statue");
        g.fillStyle(S.colors.ice, 0.85).fillTriangle(16, 0, 29, 28, 3, 28);
        g.lineStyle(2, 0xe9fbff).strokeTriangle(16, 0, 29, 28, 3, 28);
        g.fillStyle(0x61b9dc).fillRect(7, 26, 18, 5);
        g.generateTexture("ice-statue", 32, 32);
        g.clear();
      }
      this.usesFrozenSpriteSheet = this.hasCompleteSpriteSheet("ice-statue", S.enemy.frozenSpriteSheet);

      if (!this.hasCompleteImage("freeze-shot", S.attack.texture)) {
        if (this.textures.exists("freeze-shot")) this.textures.remove("freeze-shot");
        g.fillStyle(0xe8fbff).fillRect(2, 4, 12, 4);
        g.fillStyle(0x74dcff).fillRect(0, 6, 16, 5);
        g.generateTexture("freeze-shot", 16, 16);
      }

      const muscat = S.items.shineMuscat;
      if (!this.textures.exists(muscat.textureKey)) {
        g.clear();
        g.fillStyle(0x59421e).fillRect(11, 1, 3, 5);
        g.fillStyle(0x2f701f).fillRect(7, 3, 5, 4).fillRect(14, 3, 4, 5);
        g.fillStyle(0x79c73b).fillRect(8, 3, 3, 2).fillRect(15, 4, 2, 2);
        const grapePixels = [
          [8, 8], [12, 7], [16, 9],
          [6, 12], [10, 11], [14, 12], [18, 13],
          [8, 16], [12, 15], [16, 17],
          [11, 20]
        ];
        grapePixels.forEach(([x, y]) => {
          g.fillStyle(0x315d24).fillRect(x - 2, y - 2, 5, 5);
          g.fillStyle(0x8bd64a).fillRect(x - 1, y - 1, 4, 4);
          g.fillStyle(0xd7ff83).fillRect(x - 1, y - 1, 1, 1);
        });
        g.fillStyle(0x4c8f2e).fillRect(10, 21, 3, 2);
        g.generateTexture(muscat.textureKey, muscat.width, muscat.height);
      }
      g.destroy();
    }

    hasCompleteSpriteSheet(key, sheet) {
      if (!this.textures.exists(key)) return false;
      const texture = this.textures.get(key);
      const source = texture.getSourceImage();
      const frameCount = sheet.columns * sheet.rows;
      const hasExpectedSize = source.width === sheet.frameWidth * sheet.columns &&
        source.height === sheet.frameHeight * sheet.rows;
      const hasAllFrames = Array.from({ length: frameCount }, (_, frame) => texture.has(frame)).every(Boolean);
      return hasExpectedSize && hasAllFrames;
    }

    hasCompleteImage(key, spec) {
      if (!this.textures.exists(key)) return false;
      const source = this.textures.get(key).getSourceImage();
      return source.width === spec.width && source.height === spec.height;
    }

    createSamaAnimations() {
      if (!this.usesSamaSpriteSheet) return;
      const sheet = S.player.spriteSheet;
      Object.entries(sheet.directionStartFrames).forEach(([direction, startFrame]) => {
        const key = `sama-walk-${direction}`;
        if (this.anims.exists(key)) return;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers("sama", {
            frames: [startFrame, startFrame + 1, startFrame + 2, startFrame + 3]
          }),
          frameRate: sheet.animationFrameRate,
          repeat: -1
        });
      });
    }

    createEnemyAnimations() {
      if (!this.usesEnemySpriteSheet) return;
      const sheet = S.enemy.spriteSheet;
      Object.entries(sheet.directionStartFrames).forEach(([direction, startFrame]) => {
        const key = `enemy-walk-${direction}`;
        if (this.anims.exists(key)) return;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers("enemy", {
            frames: [startFrame, startFrame + 1, startFrame + 2, startFrame + 3]
          }),
          frameRate: sheet.animationFrameRate,
          repeat: -1
        });
      });
    }

    createStage() {
      const tile = S.tileSize;
      const graphics = this.add.graphics().setDepth(-2);
      for (let y = 0; y < S.height; y += tile) {
        for (let x = 0; x < S.width; x += tile) {
          graphics.fillStyle(((x / tile + y / tile) % 2) ? S.colors.floorA : S.colors.floorB);
          graphics.fillRect(x, y, tile, tile);
          graphics.lineStyle(1, S.colors.floorGrid, 0.5).strokeRect(x, y, tile, tile);
          graphics.fillStyle(S.colors.floorGlow, 0.16).fillRect(x + 2, y + 2, tile - 4, 1);
        }
      }

      this.stageData.floorDetails.forEach(([tileX, tileY, type]) => {
        const x = tileX * tile + 16;
        const y = tileY * tile + 16;
        graphics.lineStyle(1, S.colors.floorSparkle, type === "spark" ? 0.72 : 0.35);
        if (type === "spark") {
          graphics.lineBetween(x - 4, y, x + 4, y);
          graphics.lineBetween(x, y - 4, x, y + 4);
          graphics.fillStyle(S.colors.wallShine, 0.75).fillRect(x, y, 1, 1);
        } else if (type === "chip") {
          graphics.lineBetween(x - 5, y - 2, x - 1, y + 1);
          graphics.lineBetween(x - 1, y + 1, x + 4, y - 3);
        } else {
          graphics.fillStyle(S.colors.floorSparkle, 0.08).fillRect(x - 10, y - 3, 20, 6);
          graphics.fillStyle(S.colors.wallShine, 0.12).fillRect(x - 6, y - 5, 12, 2);
        }
      });

      graphics.lineStyle(2, S.colors.floorSparkle, 0.14);
      graphics.strokeRect(tile + 3, tile + 3, S.width - tile * 2 - 6, S.height - tile * 2 - 6);

      this.walls = this.physics.add.staticGroup();
      this.stageData.wallRects.forEach(([x, y, width, height]) => {
        this.add.rectangle(x + width / 2 + 3, y + height / 2 + 4, width, height, S.colors.wallShadow)
          .setDepth(-1);
        const wall = this.add.rectangle(x + width / 2, y + height / 2, width, height, S.colors.wallFace)
          .setStrokeStyle(1, S.colors.wallTop)
          .setDepth(0);
        this.add.rectangle(x + width / 2, y + 3, width - 2, 5, S.colors.wallTop).setDepth(0);
        this.add.rectangle(x + width / 2, y + 1, width - 4, 1, S.colors.wallShine).setDepth(0);
        this.add.rectangle(x + width / 2, y + height - 2, width - 2, 3, S.colors.wall).setDepth(0);
        this.physics.add.existing(wall, true);
        this.walls.add(wall);
      });
    }

    createActors() {
      const shadow = S.effects.shadow;
      const start = this.stageData.playerStart;
      this.playerShadow = this.add.ellipse(
        start.x,
        start.y + shadow.offsetY,
        shadow.width,
        shadow.height,
        0x06111f,
        shadow.alpha
      ).setDepth(1);
      this.player = this.physics.add.sprite(start.x, start.y, "sama");
      this.player.setCollideWorldBounds(true).setDepth(2);
      this.setPlayerIdleFrame();
      this.player.body.setSize(S.player.hitbox.width, S.player.hitbox.height)
        .setOffset(S.player.hitbox.offsetX, S.player.hitbox.offsetY);

      this.stageData.enemies.forEach((enemySpec, index) => this.createEnemy(enemySpec, index));
    }

    createPickups() {
      (this.stageData.pickups || []).forEach((pickupSpec) => {
        const item = S.items[pickupSpec.type];
        if (!item) return;
        const glow = this.add.ellipse(
          pickupSpec.x,
          pickupSpec.y + 7,
          item.width + 8,
          11,
          0xb8ff68,
          0.2
        ).setDepth(1);
        const pickup = this.physics.add.image(pickupSpec.x, pickupSpec.y, item.textureKey)
          .setDepth(2)
          .setName(pickupSpec.type);
        this.pickups.add(pickup);
        pickup.itemType = pickupSpec.type;
        pickup.healAmount = item.heal;
        pickup.glow = glow;
        pickup.body.setCircle(
          item.hitboxRadius,
          (item.width - item.hitboxRadius * 2) / 2,
          (item.height - item.hitboxRadius * 2) / 2
        );
        this.tweens.add({
          targets: pickup,
          y: pickupSpec.y - item.bobDistance,
          duration: item.bobDurationMs,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
        this.tweens.add({
          targets: glow,
          alpha: 0.36,
          scaleX: 1.12,
          duration: item.bobDurationMs,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      });
    }

    createEnemy(spec, index) {
      const shadow = S.effects.shadow;
      const enemy = this.physics.add.sprite(spec.x, spec.y, "enemy");
      this.enemies.add(enemy);
      enemy.setCollideWorldBounds(true).setDepth(2);
      enemy.body.setCircle(S.enemy.hitboxRadius, 3, 3);
      enemy.enemyId = `${this.stageData.id}-${index}`;
      enemy.life = S.enemy.life;
      enemy.maxLife = S.enemy.life;
      enemy.direction = spec.direction || "left";
      enemy.variantTint = spec.tint;
      const wakeDelayMs = spec.wakeDelayMs || 0;
      enemy.wakeDelayMs = wakeDelayMs;
      enemy.dashDelayOffsetMs = spec.dashDelayOffsetMs || 0;
      enemy.timersInitialized = false;
      enemy.wakeAt = Number.POSITIVE_INFINITY;
      enemy.aiState = wakeDelayMs > 0 ? "sleeping" : "chase";
      enemy.aiStateUntil = 0;
      enemy.nextDashAt = Number.POSITIVE_INFINITY;
      enemy.chainDashesRemaining = 0;
      enemy.dashVector = { x: -1, y: 0 };
      enemy.activeDashPhase = S.enemy.dash.phases[0];

      enemy.shadow = this.add.ellipse(
        spec.x,
        spec.y + shadow.offsetY,
        shadow.width,
        shadow.height,
        0x06111f,
        shadow.alpha
      ).setDepth(1);

      const bar = S.effects.enemyLifeBar;
      enemy.lifeBarBack = this.add.rectangle(
        spec.x,
        spec.y + bar.offsetY,
        bar.width + 2,
        bar.height + 2,
        0x071425,
        0.9
      ).setDepth(3).setStrokeStyle(1, 0xc7f5ff, 0.7);
      enemy.lifeBar = this.add.rectangle(
        spec.x - bar.width / 2,
        spec.y + bar.offsetY,
        bar.width,
        bar.height,
        spec.tint || 0xff6f91
      ).setOrigin(0, 0.5).setDepth(4);

      enemy.dashWarning = this.add.graphics().setDepth(1.5).setVisible(false);
      enemy.statusText = this.add.text(spec.x, spec.y - 34, "", {
        fontFamily: "monospace",
        fontSize: "10px",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#071425",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(6).setVisible(false);

      if (wakeDelayMs > 0) {
        enemy.statusText.setText(`準備中 ${Math.ceil(wakeDelayMs / 1000)}`).setVisible(true);
      }

      this.setEnemyIdleFrame(enemy);
      this.applyEnemyFreezeTint(enemy);
      return enemy;
    }

    createInput() {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys({
        attack: Phaser.Input.Keyboard.KeyCodes.Z,
        special: Phaser.Input.Keyboard.KeyCodes.X
      });
      this.input.keyboard.addCapture([
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
        Phaser.Input.Keyboard.KeyCodes.Z,
        Phaser.Input.Keyboard.KeyCodes.X
      ]);
    }

    update(time) {
      if (this.ended) {
        this.player.setVelocity(0);
        this.enemies.getChildren().forEach((enemy) => enemy.body && enemy.setVelocity(0));
        this.syncActorIndicators();
        return;
      }

      const left = this.cursors.left.isDown || inputState.left;
      const right = this.cursors.right.isDown || inputState.right;
      const up = this.cursors.up.isDown || inputState.up;
      const down = this.cursors.down.isDown || inputState.down;
      let x = Number(right) - Number(left);
      let y = Number(down) - Number(up);

      if (time < this.playerKnockbackUntil) {
        this.updatePlayerAnimation(false);
      } else if (x || y) {
        const length = Math.hypot(x, y);
        x /= length;
        y /= length;
        this.player.setVelocity(x * S.player.speed, y * S.player.speed);
        if (Math.abs(x) > Math.abs(y)) this.lastDirection = x > 0 ? "right" : "left";
        else this.lastDirection = y > 0 ? "down" : "up";
        this.updatePlayerAnimation(true);
      } else {
        this.player.setVelocity(0);
        this.updatePlayerAnimation(false);
      }

      if (Phaser.Input.Keyboard.JustDown(this.keys.attack) || requestAttack) {
        requestAttack = false;
        this.fireAttack(time);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.special) || requestSpecial) {
        requestSpecial = false;
        this.useSpecial();
      }

      this.enemies.getChildren().forEach((enemy) => this.updateEnemy(enemy, time));
      this.cullProjectiles();
      this.syncActorIndicators();
    }

    syncActorIndicators() {
      const shadow = S.effects.shadow;
      if (this.playerShadow?.active) {
        this.playerShadow.setPosition(Math.round(this.player.x), Math.round(this.player.y + shadow.offsetY));
      }
      const bar = S.effects.enemyLifeBar;
      this.enemies.getChildren().forEach((enemy) => {
        if (!enemy.active) return;
        enemy.shadow?.setPosition(Math.round(enemy.x), Math.round(enemy.y + shadow.offsetY));
        enemy.lifeBarBack?.setPosition(Math.round(enemy.x), Math.round(enemy.y + bar.offsetY));
        enemy.lifeBar?.setPosition(Math.round(enemy.x - bar.width / 2), Math.round(enemy.y + bar.offsetY));
        if (enemy.statusText?.visible) {
          enemy.statusText.setPosition(Math.round(enemy.x), Math.round(enemy.y - 34));
        }
      });
    }

    updatePlayerAnimation(isMoving) {
      if (!this.usesSamaSpriteSheet) {
        this.player.setFlipX(this.lastDirection === "left");
        return;
      }
      this.player.setFlipX(false);
      if (isMoving) this.player.anims.play(`sama-walk-${this.lastDirection}`, true);
      else {
        this.player.anims.stop();
        this.setPlayerIdleFrame();
      }
    }

    setPlayerIdleFrame() {
      if (!this.usesSamaSpriteSheet || !this.player) return;
      this.player.setFrame(S.player.spriteSheet.directionStartFrames[this.lastDirection]);
    }

    updateEnemyAnimation(enemy, isMoving) {
      if (!enemy?.active || !this.usesEnemySpriteSheet) return;
      if (isMoving) enemy.anims.play(`enemy-walk-${enemy.direction}`, true);
      else {
        enemy.anims.stop();
        this.setEnemyIdleFrame(enemy);
      }
    }

    setEnemyIdleFrame(enemy) {
      if (!this.usesEnemySpriteSheet || !enemy?.active) return;
      enemy.setFrame(S.enemy.spriteSheet.directionStartFrames[enemy.direction]);
    }

    getEnemyPhase(enemy) {
      return S.enemy.dash.phases.find((phase) => enemy.life >= phase.minLife) ||
        S.enemy.dash.phases[S.enemy.dash.phases.length - 1];
    }

    setEnemyDirectionFromVector(enemy, deltaX, deltaY) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) enemy.direction = deltaX > 0 ? "right" : "left";
      else enemy.direction = deltaY > 0 ? "down" : "up";
    }

    updateEnemy(enemy, time) {
      if (!enemy.active || !enemy.body) return;

      if (!enemy.timersInitialized) {
        enemy.timersInitialized = true;
        enemy.wakeAt = time + enemy.wakeDelayMs;
        enemy.nextDashAt = time + S.enemy.dash.firstDelayMs + enemy.dashDelayOffsetMs;
      }

      if (enemy.aiState === "sleeping") {
        enemy.setVelocity(0);
        this.updateEnemyAnimation(enemy, false);
        const remainingSeconds = Math.max(1, Math.ceil((enemy.wakeAt - time) / 1000));
        enemy.statusText.setText(`準備中 ${remainingSeconds}`).setAlpha(0.82).setVisible(true);
        if (time >= enemy.wakeAt) {
          enemy.aiState = "chase";
          enemy.nextDashAt = time + 500;
          enemy.statusText.setText("参戦!").setAlpha(1).setVisible(true);
          this.time.delayedCall(650, () => {
            if (enemy.active && enemy.statusText?.text === "参戦!") enemy.statusText.setVisible(false);
          });
        }
        return;
      }

      if (enemy.aiState === "telegraph") {
        enemy.setVelocity(0);
        this.updateEnemyAnimation(enemy, false);
        this.drawDashWarning(enemy, time);
        if (time >= enemy.aiStateUntil) this.startEnemyDash(enemy, time);
        return;
      }

      if (enemy.aiState === "dash") {
        if (time >= enemy.aiStateUntil) this.finishEnemyDash(enemy, time);
        return;
      }

      if (enemy.aiState === "chain-wait") {
        enemy.setVelocity(0);
        this.updateEnemyAnimation(enemy, false);
        if (time >= enemy.aiStateUntil) this.beginDashWarning(enemy, time, true);
        return;
      }

      if (enemy.aiState === "stunned") {
        enemy.setVelocity(0);
        this.updateEnemyAnimation(enemy, false);
        enemy.statusText.setAlpha(0.72 + Math.sin(time * 0.02) * 0.28);
        if (time >= enemy.aiStateUntil) {
          this.hideEnemyStatus(enemy);
          enemy.aiState = "chase";
          enemy.nextDashAt = time + this.getEnemyDashCooldown(enemy);
        }
        return;
      }

      const distance = Phaser.Math.Distance.BetweenPoints(this.player, enemy);
      if (time >= enemy.nextDashAt && distance >= S.enemy.dash.minDistance) {
        this.beginDashWarning(enemy, time, false);
        return;
      }

      if (distance < S.enemy.aggroRange && distance > S.enemy.stopDistance) {
        const deltaX = this.player.x - enemy.x;
        const deltaY = this.player.y - enemy.y;
        this.setEnemyDirectionFromVector(enemy, deltaX, deltaY);
        this.physics.moveToObject(enemy, this.player, this.getEnemyPhase(enemy).chaseSpeed);
        this.updateEnemyAnimation(enemy, true);
      } else {
        enemy.setVelocity(0);
        this.updateEnemyAnimation(enemy, false);
      }
    }

    getEnemyDashCooldown(enemy) {
      const baseCooldown = this.getEnemyPhase(enemy).cooldownMs;
      const lastEnemyMultiplier = this.stageData.lastEnemyCooldownMultiplier;
      if (!lastEnemyMultiplier || this.enemies.countActive(true) !== 1) return baseCooldown;
      return Math.round(baseCooldown * lastEnemyMultiplier);
    }

    beginDashWarning(enemy, time, isChain) {
      const deltaX = this.player.x - enemy.x;
      const deltaY = this.player.y - enemy.y;
      const length = Math.hypot(deltaX, deltaY) || 1;
      enemy.dashVector = { x: deltaX / length, y: deltaY / length };
      this.setEnemyDirectionFromVector(enemy, enemy.dashVector.x, enemy.dashVector.y);

      if (!isChain) {
        enemy.activeDashPhase = this.getEnemyPhase(enemy);
        enemy.chainDashesRemaining = enemy.activeDashPhase.count;
      }

      const warningScale = isChain ? 0.76 : 1;
      enemy.aiState = "telegraph";
      enemy.aiStateUntil = time + enemy.activeDashPhase.warningMs * warningScale;
      enemy.setVelocity(0);
      this.updateEnemyAnimation(enemy, false);
      enemy.statusText.setText(isChain ? "!!" : "!").setAlpha(1).setVisible(true);
      enemy.dashWarning.setVisible(true);
      this.drawDashWarning(enemy, time);
    }

    drawDashWarning(enemy, time) {
      const warning = S.effects.dashWarning;
      const pulse = 0.68 + Math.sin(time * 0.035) * 0.22;
      const length = S.enemy.dash.warningLength;
      const startX = Math.round(enemy.x);
      const startY = Math.round(enemy.y);
      const endX = Math.round(startX + enemy.dashVector.x * length);
      const endY = Math.round(startY + enemy.dashVector.y * length);

      enemy.dashWarning.clear();
      enemy.dashWarning.lineStyle(7, warning.wideColor, 0.2 + pulse * 0.12);
      enemy.dashWarning.lineBetween(startX, startY, endX, endY);
      enemy.dashWarning.lineStyle(2, warning.coreColor, pulse);
      enemy.dashWarning.lineBetween(startX, startY, endX, endY);
      enemy.dashWarning.fillStyle(warning.markerColor, pulse).fillCircle(endX, endY, 4);
    }

    startEnemyDash(enemy, time) {
      this.hideDashWarning(enemy);
      enemy.aiState = "dash";
      enemy.aiStateUntil = time + S.enemy.dash.durationMs;
      enemy.chainDashesRemaining -= 1;
      enemy.setVelocity(
        enemy.dashVector.x * enemy.activeDashPhase.speed,
        enemy.dashVector.y * enemy.activeDashPhase.speed
      );
      this.updateEnemyAnimation(enemy, true);
      this.createPixelBurst(enemy.x, enemy.y, S.effects.dashWarning.coreColor, 0.8);
    }

    finishEnemyDash(enemy, time) {
      if (!enemy.active) return;
      enemy.setVelocity(0);
      this.updateEnemyAnimation(enemy, false);
      if (enemy.chainDashesRemaining > 0) {
        enemy.aiState = "chain-wait";
        enemy.aiStateUntil = time + S.enemy.dash.chainGapMs;
        enemy.statusText.setText("!!").setAlpha(1).setVisible(true);
        return;
      }
      this.hideEnemyStatus(enemy);
      enemy.aiState = "chase";
      enemy.nextDashAt = time + this.getEnemyDashCooldown(enemy);
    }

    onEnemyWall(first, second) {
      const enemy = first.texture?.key === "enemy" ? first : second;
      if (!enemy?.active || enemy.aiState !== "dash") return;
      this.stunEnemy(enemy, this.time.now);
    }

    stunEnemy(enemy, time) {
      this.hideDashWarning(enemy);
      enemy.chainDashesRemaining = 0;
      enemy.aiState = "stunned";
      enemy.aiStateUntil = time + S.enemy.dash.stunMs;
      enemy.setVelocity(0);
      this.updateEnemyAnimation(enemy, false);
      enemy.statusText.setText("チャンス!").setAlpha(1).setVisible(true);
      this.createPixelBurst(enemy.x, enemy.y, S.effects.stunBurst.color, S.effects.stunBurst.alpha);
    }

    hideDashWarning(enemy) {
      enemy?.dashWarning?.clear().setVisible(false);
      if (enemy?.statusText?.text === "!" || enemy?.statusText?.text === "!!") {
        enemy.statusText.setVisible(false);
      }
    }

    hideEnemyStatus(enemy) {
      this.hideDashWarning(enemy);
      enemy?.statusText?.setVisible(false).setAlpha(1);
    }

    fireAttack(time) {
      if (time < this.nextAttackAt || this.clearing) return;
      this.nextAttackAt = time + S.attack.cooldownMs;
      const vectors = {
        up: [0, -1, -90], down: [0, 1, 90], left: [-1, 0, 180], right: [1, 0, 0]
      };
      const [dx, dy, angle] = vectors[this.lastDirection];
      const shot = this.projectiles.create(
        this.player.x + dx * S.attack.spawnOffset,
        this.player.y + dy * S.attack.spawnOffset,
        "freeze-shot"
      );
      shot.body.setSize(S.attack.size, S.attack.size, true);
      shot.setAngle(angle).setVelocity(dx * S.attack.speed, dy * S.attack.speed);
      shot.spawnX = shot.x;
      shot.spawnY = shot.y;
      audio.play("shot");
    }

    useSpecial() {
      if (this.ended || this.clearing || this.specialGauge < S.special.maxGauge) return;
      const targets = this.enemies.getChildren().filter((enemy) => enemy.active &&
        Phaser.Math.Distance.BetweenPoints(this.player, enemy) <= S.special.radius);
      if (!targets.length) return;

      this.specialGauge = 0;
      this.updateSpecialHud();
      audio.play("special");
      this.createChristmasTreeSpecialEffect();
      this.cameras.main.flash(120, 190, 245, 255, false);
      this.createPixelBurst(this.player.x, this.player.y, S.special.ringColor, 1);
      targets.forEach((enemy) => this.damageEnemy(enemy, S.special.damage, false, false));
    }

    createChristmasTreeSpecialEffect() {
      const effect = S.special.treeEffect;
      const tree = this.add.container(effect.centerX, effect.centerY)
        .setDepth(8)
        .setAlpha(0)
        .setScale(0.08);
      const addBlock = (x, y, width, height, color, alpha = 1) => {
        const block = this.add.rectangle(
          Math.round(x),
          Math.round(y),
          Math.round(width),
          Math.round(height),
          color,
          alpha
        );
        tree.add(block);
        return block;
      };

      addBlock(0, 7, effect.backdropWidth, effect.backdropHeight, effect.glowColor, 0.09);
      addBlock(0, 7, effect.backdropWidth - 28, effect.backdropHeight + 12, effect.glowColor, 0.06);

      [-116, -84, -52, -20, 12, 44, 76, 108].forEach((y, index) => {
        const width = 28 + index * 29;
        addBlock(0, y, width + 8, effect.rowHeight + 6, effect.treeOutlineColor, 0.96);
        addBlock(0, y, width, effect.rowHeight, effect.treeColors[index % effect.treeColors.length], 1);
      });

      effect.rows.forEach(([y, width], index) => {
        addBlock(0, y, width + 8, effect.rowHeight + 6, effect.treeOutlineColor, 1);
        addBlock(0, y, width, effect.rowHeight, effect.treeColors[index % effect.treeColors.length], 1);
        if (effect.snowRows.includes(index)) {
          addBlock(-Math.round(width * 0.18), y - 5, Math.max(18, Math.round(width * 0.56)), 4, effect.snowColor, 1);
          addBlock(Math.round(width * 0.31), y - 3, Math.max(8, Math.round(width * 0.17)), 4, effect.snowShadowColor, 1);
        }
      });

      addBlock(0, 132, 38, 38, effect.trunkOutlineColor, 1);
      addBlock(0, 130, 26, 34, effect.trunkColor, 1);
      addBlock(0, 150, 98, 12, effect.snowShadowColor, 0.96);
      addBlock(0, 146, 78, 10, effect.snowColor, 1);

      const starParts = [
        [0, -139, 10, 42], [0, -139, 42, 10],
        [-11, -150, 10, 10], [11, -150, 10, 10],
        [-11, -128, 10, 10], [11, -128, 10, 10]
      ];
      starParts.forEach(([x, y, width, height]) => addBlock(x, y, width, height, effect.starColor, 1));
      const starCore = addBlock(0, -139, 10, 10, effect.starCoreColor, 1);

      const twinkleTargets = [starCore];
      effect.ornaments.forEach(([x, y], index) => {
        addBlock(x + 1, y + 2, 10, 10, effect.treeOutlineColor, 0.85);
        twinkleTargets.push(addBlock(x, y, 8, 8, effect.ornamentColors[index % effect.ornamentColors.length], 1));
      });
      effect.lights.forEach(([x, y], index) => {
        twinkleTargets.push(addBlock(x, y, 5, 5, effect.lightColors[index % effect.lightColors.length], 1));
      });

      effect.snowflakes.forEach(([x, y], index) => {
        const flake = this.add.container(Math.round(x), Math.round(y));
        flake.add(this.add.rectangle(0, 0, 4, 12, effect.snowColor, 0.92));
        flake.add(this.add.rectangle(0, 0, 12, 4, effect.snowColor, 0.92));
        tree.add(flake);
        this.tweens.add({
          targets: flake,
          y: flake.y + 28,
          alpha: 0.16,
          duration: effect.enterMs + effect.holdMs + effect.exitMs,
          delay: index * 22,
          ease: "Sine.easeIn"
        });
      });

      twinkleTargets.forEach((target, index) => {
        this.tweens.add({
          targets: target,
          alpha: 0.28,
          scaleX: 1.45,
          scaleY: 1.45,
          duration: 95,
          delay: effect.enterMs + index * 24,
          yoyo: true,
          repeat: 2
        });
      });

      this.tweens.add({
        targets: tree,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: effect.enterMs,
        ease: "Back.easeOut",
        onComplete: () => {
          this.time.delayedCall(effect.holdMs, () => {
            if (!tree.active) return;
            this.tweens.add({
              targets: tree,
              alpha: 0,
              scaleX: 1.12,
              scaleY: 1.12,
              duration: effect.exitMs,
              ease: "Quad.easeIn",
              onComplete: () => {
                this.tweens.killTweensOf(tree.list);
                tree.destroy(true);
              }
            });
          });
        }
      });
    }

    gainSpecial(amount) {
      this.specialGauge = Math.min(S.special.maxGauge, this.specialGauge + amount);
      this.updateSpecialHud();
    }

    cullProjectiles() {
      this.projectiles.getChildren().forEach((shot) => {
        if (Phaser.Math.Distance.Between(shot.spawnX, shot.spawnY, shot.x, shot.y) >= S.attack.range) {
          shot.destroy();
        }
      });
    }

    onProjectileWall(first, second) {
      const shot = first.texture?.key === "freeze-shot" ? first : second;
      if (!shot?.active) return;
      this.createPixelBurst(shot.x, shot.y, 0x7de7ff, 0.72);
      shot.destroy();
    }

    onEnemyHit(first, second) {
      const shot = first.texture?.key === "freeze-shot" ? first : second;
      const enemy = shot === first ? second : first;
      if (!shot?.active || !enemy?.active || this.ended) return;
      shot.destroy();
      this.damageEnemy(enemy, S.attack.damage, true);
    }

    damageEnemy(enemy, damage, chargeGauge, playImpactSound = true) {
      if (!enemy?.active || enemy.life <= 0) return;
      enemy.life = Math.max(0, enemy.life - damage);
      if (playImpactSound) audio.play(enemy.life === 0 ? "freeze" : "hit");
      if (chargeGauge) this.gainSpecial(S.special.gainPerHit);
      this.createPixelBurst(enemy.x, enemy.y, 0xcdf8ff, 1);
      this.updateEnemyLifeVisual(enemy);
      enemy.setTintFill(0xcdf8ff);
      this.time.delayedCall(90, () => enemy.active && this.applyEnemyFreezeTint(enemy));
      this.updateHud();
      if (enemy.life === 0) this.freezeEnemy(enemy);
    }

    applyEnemyFreezeTint(enemy) {
      if (!enemy?.active) return;
      const hitsTaken = enemy.maxLife - enemy.life;
      const tintIndex = Math.min(hitsTaken - 1, S.effects.freezeTints.length - 1);
      if (tintIndex >= 0) enemy.setTint(S.effects.freezeTints[tintIndex]);
      else if (enemy.variantTint) enemy.setTint(enemy.variantTint);
      else enemy.clearTint();
    }

    updateEnemyLifeVisual(enemy) {
      if (!enemy?.lifeBar?.active) return;
      const bar = S.effects.enemyLifeBar;
      const ratio = enemy.life / enemy.maxLife;
      enemy.lifeBar.setDisplaySize(Math.max(1, Math.round(bar.width * ratio)), bar.height);
      enemy.lifeBar.setFillStyle(ratio <= 0.4 ? 0x8feaff : (enemy.variantTint || 0xff6f91));
    }

    createPixelBurst(x, y, color, alpha) {
      const burst = S.effects.burst;
      for (let index = 0; index < burst.shardCount; index += 1) {
        const angle = (Math.PI * 2 * index) / burst.shardCount;
        const shard = this.add.rectangle(
          Math.round(x),
          Math.round(y),
          burst.shardSize,
          burst.shardSize,
          color,
          alpha
        ).setDepth(5);
        this.tweens.add({
          targets: shard,
          x: Math.round(x + Math.cos(angle) * burst.distance),
          y: Math.round(y + Math.sin(angle) * burst.distance),
          alpha: 0,
          duration: burst.durationMs,
          ease: "Quad.easeOut",
          onComplete: () => shard.destroy()
        });
      }
    }

    freezeEnemy(enemy) {
      const { x, y, direction } = enemy;
      this.hideEnemyStatus(enemy);
      this.createPixelBurst(x, y, S.colors.ice, 1);
      enemy.lifeBar?.destroy();
      enemy.lifeBarBack?.destroy();
      enemy.dashWarning?.destroy();
      enemy.statusText?.destroy();
      const statueShadow = enemy.shadow;
      this.enemies.remove(enemy, true, true);

      const reveal = S.effects.freezeReveal;
      const frozenFrame = this.usesFrozenSpriteSheet
        ? S.enemy.frozenSpriteSheet.directionStartFrames[direction]
        : undefined;
      const statue = this.add.image(x, y, "ice-statue", frozenFrame)
        .setDepth(1.5)
        .setName("ice-statue")
        .setScale(reveal.startScale)
        .setAlpha(0.55);
      this.frozenStatues.push(statue);
      this.tweens.add({
        targets: statue,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        duration: reveal.popDurationMs,
        ease: "Back.easeOut"
      });
      statueShadow?.setPosition(Math.round(x), Math.round(y + S.effects.shadow.offsetY)).setAlpha(0.22);
      this.updateHud();

      if (this.enemies.countActive(true) === 0) {
        this.clearing = true;
        this.time.delayedCall(reveal.delayMs, () => this.finish("clear"));
      }
    }

    onPlayerEnemy(first, second) {
      const enemy = first === this.player ? second : first;
      const now = this.time.now;
      if (!enemy?.active || now < this.nextContactAt || this.ended) return;
      const response = S.player.damageResponse;
      this.nextContactAt = now + (response.invincibilityMs || S.enemy.contactCooldownMs);
      this.playerLife = Math.max(0, this.playerLife - S.enemy.contactDamage);
      audio.play("damage");
      this.gainSpecial(S.special.gainOnDamage);

      let knockbackX = this.player.x - enemy.x;
      let knockbackY = this.player.y - enemy.y;
      let knockbackLength = Math.hypot(knockbackX, knockbackY);
      if (knockbackLength < 0.01) {
        knockbackX = -enemy.dashVector.x;
        knockbackY = -enemy.dashVector.y;
        knockbackLength = 1;
      }
      this.playerKnockbackUntil = now + response.knockbackDurationMs;
      this.player.setVelocity(
        knockbackX / knockbackLength * response.knockbackSpeed,
        knockbackY / knockbackLength * response.knockbackSpeed
      );

      this.createPixelBurst(this.player.x, this.player.y, 0xffffff, 0.9);
      this.cameras.main.shake(S.effects.damageShake.durationMs, S.effects.damageShake.intensity);
      this.player.setTintFill(0xffffff);
      this.time.delayedCall(100, () => this.player.active && this.player.clearTint());
      this.tweens.killTweensOf(this.player);
      const blinkRepeats = Math.max(
        1,
        Math.floor(response.invincibilityMs / (response.blinkIntervalMs * 2)) - 1
      );
      this.tweens.add({
        targets: this.player,
        alpha: 0.3,
        duration: response.blinkIntervalMs,
        yoyo: true,
        repeat: blinkRepeats,
        onComplete: () => this.player?.active && this.player.setAlpha(1)
      });

      if (enemy.aiState === "dash") {
        this.hideEnemyStatus(enemy);
        enemy.chainDashesRemaining = 0;
        enemy.aiState = "chase";
        enemy.setVelocity(0);
        enemy.nextDashAt = now + S.enemy.dash.hitRecoveryMs;
      }
      this.updateHud();
      if (this.playerLife === 0) this.finish("gameover");
    }

    onPickup(first, second) {
      const pickup = first === this.player ? second : first;
      if (!pickup?.active || this.ended || this.playerLife >= this.maxPlayerLife) return;
      const healed = Math.min(pickup.healAmount, this.maxPlayerLife - this.playerLife);
      this.playerLife += healed;
      audio.play("pickup");
      this.tweens.killTweensOf(pickup);
      this.tweens.killTweensOf(pickup.glow);
      pickup.glow?.destroy();
      this.createPixelBurst(pickup.x, pickup.y, 0xd7ff83, 1);
      this.showFloatingText(pickup.x, pickup.y - 12, `LIFE +${healed}`, "#dfff91");
      pickup.destroy();
      this.cameras.main.flash(90, 195, 255, 150, false);
      this.updateHud();
    }

    showFloatingText(x, y, message, color) {
      const text = this.add.text(Math.round(x), Math.round(y), message, {
        fontFamily: "monospace",
        fontSize: "10px",
        fontStyle: "bold",
        color,
        stroke: "#153016",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(7);
      this.tweens.add({
        targets: text,
        y: y - 18,
        alpha: 0,
        duration: 700,
        ease: "Quad.easeOut",
        onComplete: () => text.destroy()
      });
    }

    finish(type) {
      if (this.ended) return;
      this.ended = true;
      audio.play(type === "clear" ? "clear" : "gameover");
      this.enemies.getChildren().forEach((enemy) => {
        this.hideEnemyStatus(enemy);
        enemy.setVelocity(0);
        this.updateEnemyAnimation(enemy, false);
      });
      this.tweens.killTweensOf(this.player);
      this.player.setAlpha(1).setVelocity(0);
      this.updatePlayerAnimation(false);
      this.physics.pause();

      const title = document.getElementById("result-title");
      const message = document.getElementById("result-message");
      const nextButton = document.getElementById("next-stage-button");
      const retryButton = document.getElementById("retry-button");
      const hasNextStage = this.stageIndex < S.stages.length - 1;

      if (type === "clear") {
        title.textContent = this.stageData.finalTitle || `${this.stageData.name} CLEAR!`;
        message.textContent = hasNextStage
          ? `必殺ゲージを引き継いで${S.stages[this.stageIndex + 1].name}へ進みます`
          : "すべてのニットちゃんを完全に凍結しました";
        nextButton.classList.toggle("hidden", !hasNextStage);
        if (hasNextStage) nextButton.textContent = `${S.stages[this.stageIndex + 1].name}へ`;
        retryButton.textContent = "このステージをやり直す";
      } else {
        title.textContent = "GAME OVER";
        message.textContent = "さまちゃんのライフがなくなりました";
        nextButton.classList.add("hidden");
        retryButton.textContent = "リトライ";
      }
      document.getElementById("result").classList.remove("hidden");
    }

    hideResult() {
      document.getElementById("result").classList.add("hidden");
      document.getElementById("next-stage-button").classList.add("hidden");
    }

    updateHud() {
      document.getElementById("stage-label").textContent = `${this.stageData.name} · ${this.difficulty.label}`;
      document.getElementById("player-life").textContent = "♥".repeat(this.playerLife) || "0";
      const activeEnemies = this.enemies.getChildren().filter((enemy) => enemy.active);
      const totalLife = activeEnemies.reduce((sum, enemy) => sum + enemy.life, 0);
      const totalMaxLife = this.stageData.enemies.length * S.enemy.life;
      document.getElementById("enemy-label").textContent = this.stageData.enemies.length > 1
        ? `敵 ${activeEnemies.length}体`
        : "敵";
      document.getElementById("enemy-life").textContent = totalMaxLife > S.enemy.life
        ? `♥ ${totalLife}/${totalMaxLife}`
        : ("♥".repeat(totalLife) || "0");
      this.updateSpecialHud();
    }

    updateSpecialHud() {
      const ratio = this.specialGauge / S.special.maxGauge;
      const fill = document.getElementById("special-fill");
      const button = document.getElementById("special-button");
      const buttonStatus = button.querySelector("small");
      fill.style.width = `${Math.round(ratio * 100)}%`;
      const ready = this.specialGauge >= S.special.maxGauge;
      button.disabled = !ready;
      button.classList.toggle("ready", ready);
      buttonStatus.textContent = ready ? "X" : `${Math.round(ratio * 100)}%`;
      button.setAttribute("aria-label", ready ? "必殺技（使用可能）" : `必殺技（${Math.round(ratio * 100)}パーセント）`);
    }
  }

  let viewportSyncFrame = 0;

  function syncViewportSize() {
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || window.innerWidth));
    const height = Math.max(1, Math.round(viewport?.height || window.innerHeight));
    document.documentElement.style.setProperty("--app-width", `${width}px`);
    document.documentElement.style.setProperty("--app-height", `${height}px`);
  }

  function scheduleViewportSync() {
    window.cancelAnimationFrame(viewportSyncFrame);
    viewportSyncFrame = window.requestAnimationFrame(syncViewportSize);
  }

  function bindViewportSize() {
    syncViewportSize();
    window.addEventListener("resize", scheduleViewportSync, { passive: true });
    window.addEventListener("orientationchange", scheduleViewportSync, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleViewportSync, { passive: true });
    window.visualViewport?.addEventListener("scroll", scheduleViewportSync, { passive: true });
  }

  function bindControls() {
    const unlockAudio = () => audio.unlock();
    document.addEventListener("pointerdown", unlockAudio, { capture: true, passive: true });
    document.addEventListener("click", unlockAudio, { capture: true, passive: true });
    document.addEventListener("keydown", unlockAudio, { capture: true, passive: true });
    const soundButton = document.getElementById("sound-toggle");
    audio.updateButton();
    soundButton.addEventListener("click", (event) => {
      event.preventDefault();
      audio.toggle();
    });

    document.querySelectorAll("[data-direction]").forEach((button) => {
      const direction = button.dataset.direction;
      const press = (event) => {
        event.preventDefault();
        inputState[direction] = true;
        button.classList.add("pressed");
        try {
          button.setPointerCapture?.(event.pointerId);
        } catch {
          // 合成イベントでは実ポインターのcaptureが不要な場合がある。
        }
      };
      const release = (event) => {
        event.preventDefault();
        inputState[direction] = false;
        button.classList.remove("pressed");
      };
      button.addEventListener("pointerdown", press, { passive: false });
      button.addEventListener("pointerup", release, { passive: false });
      button.addEventListener("pointercancel", release, { passive: false });
      button.addEventListener("lostpointercapture", release, { passive: false });
    });

    const attackButton = document.getElementById("attack-button");
    attackButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      requestAttack = true;
      attackButton.classList.add("pressed");
      try {
        attackButton.setPointerCapture?.(event.pointerId);
      } catch {
        // 合成イベントでは実ポインターのcaptureが不要な場合がある。
      }
    }, { passive: false });
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => {
      attackButton.addEventListener(name, () => attackButton.classList.remove("pressed"));
    });

    const specialButton = document.getElementById("special-button");
    specialButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (specialButton.disabled) return;
      requestSpecial = true;
      specialButton.classList.add("pressed");
      try {
        specialButton.setPointerCapture?.(event.pointerId);
      } catch {
        // 合成イベントでは実ポインターのcaptureが不要な場合がある。
      }
    }, { passive: false });
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => {
      specialButton.addEventListener(name, () => specialButton.classList.remove("pressed"));
    });

    document.getElementById("retry-button").addEventListener("click", () => {
      resetInputState();
      if (!game) return;
      const scene = game.scene.getScene("phase-one");
      scene.scene.restart({
        stageIndex: scene.stageIndex,
        specialGauge: 0,
        difficultyId: scene.difficultyId
      });
    });

    document.getElementById("next-stage-button").addEventListener("click", () => {
      resetInputState();
      if (!game) return;
      const scene = game.scene.getScene("phase-one");
      scene.scene.restart({
        stageIndex: scene.stageIndex + 1,
        specialGauge: scene.specialGauge,
        difficultyId: scene.difficultyId
      });
    });

    document.getElementById("title-button").addEventListener("click", showStartScreen);
    bindTapAction(document.getElementById("start-button"), startGame);
    createDifficultyButtons();

    window.addEventListener("blur", resetInputState);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) resetInputState();
      audio.setSuspended(document.hidden);
    });
    ["touchmove", "gesturestart"].forEach((eventName) => {
      document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
    });
    document.querySelectorAll(".control, .action").forEach((button) => {
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    });
  }

  function bindTapAction(button, action) {
    let suppressClickUntil = 0;
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      event.preventDefault();
      suppressClickUntil = performance.now() + 800;
      action();
    }, { passive: false });
    button.addEventListener("click", (event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault();
        return;
      }
      action();
    });
  }

  function createDifficultyButtons() {
    const container = document.getElementById("difficulty-options");
    container.replaceChildren();
    Object.values(S.difficulty?.options || {}).forEach((difficulty) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "difficulty-button";
      button.dataset.difficulty = difficulty.id;
      button.setAttribute("aria-pressed", "false");

      const label = document.createElement("strong");
      label.textContent = difficulty.label;
      const life = document.createElement("span");
      life.textContent = `♥ × ${difficulty.playerLife}`;
      button.append(label, life);
      bindTapAction(button, () => selectDifficulty(difficulty.id));
      container.appendChild(button);
    });
    selectDifficulty(selectedDifficultyId);
  }

  function selectDifficulty(id) {
    const difficulty = getDifficulty(id);
    selectedDifficultyId = difficulty.id;
    document.querySelectorAll(".difficulty-button").forEach((button) => {
      const selected = button.dataset.difficulty === selectedDifficultyId;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.getElementById("difficulty-description").textContent = difficulty.description;
  }

  function createGame() {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game",
      width: S.width,
      height: S.height,
      backgroundColor: "#10182f",
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      physics: {
        default: "arcade",
        arcade: { debug: false }
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: S.width,
        height: S.height
      },
      scene: GameScene
    });
    window.__FREEZE_QUEEN_GAME__ = game;
  }

  function startGame() {
    resetInputState();
    activeDifficultyId = selectedDifficultyId;
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("game-shell").classList.remove("awaiting-start");
    audio.beginMusic(true);
    if (game) game.destroy(true);
    createGame();
  }

  function showStartScreen() {
    resetInputState();
    if (game) {
      game.destroy(true);
      game = null;
      window.__FREEZE_QUEEN_GAME__ = null;
    }
    document.getElementById("result").classList.add("hidden");
    document.getElementById("next-stage-button").classList.add("hidden");
    document.getElementById("game-shell").classList.add("awaiting-start");
    document.getElementById("start-screen").classList.remove("hidden");
    audio.prepareForTitle();
    window.requestAnimationFrame(() => document.getElementById("start-button").focus({ preventScroll: true }));
  }

  window.addEventListener("load", () => {
    bindViewportSize();
    bindControls();
    showStartScreen();
  });
}());
