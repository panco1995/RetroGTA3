import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { StreetScene } from './scenes/StreetScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#0b0d10',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, StreetScene],
};

const game = new Phaser.Game(config);

(window as unknown as Record<string, unknown>).__GAME__ = game;
