import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';

type LevelConfig = {
  id: number;
  name: string;
  worldSpeed: number;
  spawnInterval: number;
  obstacleChanceForTall: number;
  scoreToUnlockNext: number;
};

@Component({
  selector: 'app-pixi-canvas',
  standalone: true,
  templateUrl: './pixi-canvas.component.html',
  styleUrl: './pixi-canvas.component.scss',
})
export class PixiCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameHost', { static: true })
  gameHost!: ElementRef<HTMLDivElement>;

  private app?: Application;
  private readonly root = new Container();

  private readonly groundHeight = 100;
  private velocityY = 0;
  private readonly gravity = 0.5;
  private readonly jumpForce = -11;
  private isOnGround = false;
  private obstacles: Graphics[] = [];
  private spawnTimer = 0;
  private levelText!: Text;
  private player!: Container;
  private leftLeg!: Graphics;
  private rightLeg!: Graphics;
  private runTime = 0;
  private readonly playerWidth = 24;
  private readonly playerHeight = 56;

  private isPaused = false;
  private isGameStarted = false;
  private startText!: Text;
  private pauseText!: Text;

  private scoreText!: Text;
  private messageText!: Text;

  private score = 0;
  private gameOver = false;
  private currentLevelIndex = 0;


  private readonly levels: LevelConfig[] = [
    {
      id: 1,
      name: 'Easy',
      worldSpeed: 4,
      spawnInterval: 100,
      obstacleChanceForTall: 0.3,
      scoreToUnlockNext: 5,
    },
    {
      id: 2,
      name: 'Medium',
      worldSpeed: 6,
      spawnInterval: 80,
      obstacleChanceForTall: 0.5,
      scoreToUnlockNext: 12,
    },
    {
      id: 3,
      name: 'Hard',
      worldSpeed: 8,
      spawnInterval: 65,
      obstacleChanceForTall: 0.7,
      scoreToUnlockNext: 999999,
    },
  ];


  private readonly pressedKeys = new Set<string>();

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.pressedKeys.add(event.key.toLowerCase());

    if (this.gameOver && event.key.toLowerCase() === 'r') {
      this.resetGame();
    }

    if (event.key.toLowerCase() === 'p' && !this.gameOver) {
      this.togglePause();
    }

    if (event.key.toLowerCase() === 'enter' && !this.gameOver && !this.isGameStarted) {
      this.isGameStarted = true;
      this.startText.visible = false;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.key.toLowerCase());
  };

  async ngAfterViewInit(): Promise<void> {
    await this.initPixi();
    this.createScene();
    this.createStartScreen();
    this.bindEvents();
    this.startLoop();
  }

  ngOnDestroy(): void {
    globalThis.removeEventListener('keydown', this.onKeyDown);
    globalThis.removeEventListener('keyup', this.onKeyUp);
    this.app?.destroy(true);
  }

  private async initPixi(): Promise<void> {
    this.app = new Application();

    await this.app.init({
      resizeTo: this.gameHost.nativeElement,
      background: '#0b1020',
      antialias: true,
    });

    this.gameHost.nativeElement.appendChild(this.app.canvas);
    this.app.stage.addChild(this.root);
  }

  private createStartScreen(): void {
    const startStyle = new TextStyle({
      fill: '#fbbf24',
      fontSize: 36,
      fontFamily: 'Arial',
      fontWeight: 'bold',
    });

    this.startText = new Text({
      text: 'Press ENTER to Start',
      style: startStyle,
    });

    this.startText.anchor.set(0.5);
    this.startText.x = this.app!.renderer.width / 2;
    this.startText.y = this.app!.renderer.height / 2;

    this.root.addChild(this.startText);
  }

  private createScene(): void {
    this.createBackground();
    this.createHud();
    this.createObstacle();
    this.createPlayer();
  }

  private updateObstacles(): void {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obstacle = this.obstacles[i];
      obstacle.x -= this.currentLevel.worldSpeed;

      const obstacleWidth = (obstacle as any).obstacleWidth;

      if (obstacle.x + obstacleWidth < 0) {
        this.root.removeChild(obstacle);
        obstacle.destroy();
        this.obstacles.splice(i, 1);
      }
    }
  }

  private checkObstacleCollisions(): void {
    for (const obstacle of this.obstacles) {
      const obstacleWidth = (obstacle as any).obstacleWidth;
      const obstacleHeight = (obstacle as any).obstacleHeight;

      const isHit =
        this.player.x - this.playerWidth / 2 < obstacle.x + obstacleWidth &&
        this.player.x + this.playerWidth / 2 > obstacle.x &&
        this.player.y < obstacle.y + obstacleHeight &&
        this.player.y + this.playerHeight > obstacle.y;

      if (isHit) {
        this.endGame();
        return;
      }
    }
  }

  private checkObstaclePassed(): void {
    for (const obstacle of this.obstacles) {
      const obstacleWidth = (obstacle as any).obstacleWidth;
      const passed = obstacle.x + obstacleWidth < this.player.x;

      if (passed && !(obstacle as any).passed) {
        (obstacle as any).passed = true;
        this.score += 1;
        this.updateHud();
      }
    }
  }

  private spawnObstaclesIfNeeded(): void {
    this.spawnTimer++;

    if (this.spawnTimer >= this.currentLevel.spawnInterval) {
      this.spawnTimer = 0;
      this.createObstacle();
    }
  }

  private createBackground(): void {
    const width = this.app!.renderer.width;
    const height = this.app!.renderer.height;

    // 🌱 Grass (bottom)
    const grass = new Graphics()
      .rect(0, height - this.groundHeight, width, this.groundHeight)
      .fill(0x22c55e);

    // 🌌 Sky (top)
    const sky = new Graphics()
      .rect(0, 0, width, height - this.groundHeight)
      .fill(0x38bdf8);

    // Add in correct order (sky first, grass after)
    this.root.addChild(sky);
    this.root.addChild(grass);
  }

  private createHud(): void {
    const hudStyle = new TextStyle({
      fill: '#ffffff',
      fontSize: 24,
      fontFamily: 'Arial',
      fontWeight: 'bold',
    });

    const messageStyle = new TextStyle({
      fill: '#fbbf24',
      fontSize: 30,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      align: 'center',
    });

    this.scoreText = new Text({
      text: 'Score: 0',
      style: hudStyle,
    });
    this.scoreText.x = 16;
    this.scoreText.y = 12;

    this.messageText = new Text({
      text: '',
      style: messageStyle,
    });

    this.levelText = new Text({
      text: 'Level: 1',
      style: hudStyle,
    });
    this.levelText.x = 16;
    this.levelText.y = 44;


    this.messageText.anchor.set(0.5);
    this.messageText.x = this.app!.renderer.width / 2;
    this.messageText.y = this.app!.renderer.height / 2;

    this.pauseText = new Text({
      text: 'PAUSED',
      style: messageStyle,
    });
    this.pauseText.anchor.set(0.5);
    this.pauseText.x = this.app!.renderer.width / 2;
    this.pauseText.y = this.app!.renderer.height / 2 - 80;
    this.pauseText.visible = false;

    this.root.addChild(this.scoreText, this.levelText, this.messageText, this.pauseText);
  }



  private createPlayer(): void {
    this.player = new Container();
    const head = new Graphics()
      .circle(0, 0, 10)
      .fill(0xffd4a3);

    const body = new Graphics()
      .rect(-6, 12, 12, 24)
      .fill(0x2563eb);

    const leftArm = new Graphics()
      .rect(0, 0, 4, 18)
      .fill(0xffd4a3);

    leftArm.x = -10;
    leftArm.y = 14;

    const rightArm = new Graphics()
      .rect(0, 0, 4, 18)
      .fill(0xffd4a3);

    rightArm.x = 6;
    rightArm.y = 14;

    this.leftLeg = new Graphics()
      .rect(0, 0, 5, 20)
      .fill(0x1f2937);

    this.rightLeg = new Graphics()
      .rect(0, 0, 5, 20)
      .fill(0x1f2937);

    // pivot at top of leg, like a hip joint
    this.leftLeg.pivot.set(2.5, 0);
    this.rightLeg.pivot.set(2.5, 0);

    this.leftLeg.x = -4;
    this.leftLeg.y = 36;

    this.rightLeg.x = 4;
    this.rightLeg.y = 36;

    this.player.addChild(head, body, leftArm, rightArm, this.leftLeg, this.rightLeg);

    this.player.x = 120;
    this.player.y = this.app!.renderer.height - this.groundHeight - 56;

    this.root.addChild(this.player);
  }

  private createObstacle(): void {
    const obstacle = new Graphics();

    const isTree = Math.random() < this.currentLevel.obstacleChanceForTall;

    let obstacleWidth = 30;
    let obstacleHeight = 40;
    let color = 0x808080;

    if (isTree) {
      obstacleWidth = 36;
      obstacleHeight = 70;
      color = 0x2e7d32;
    }

    obstacle.rect(0, 0, obstacleWidth, obstacleHeight);
    obstacle.fill(color);

    obstacle.x = this.app!.renderer.width + 20;
    obstacle.y = this.app!.renderer.height - this.groundHeight - obstacleHeight;

    (obstacle as any).obstacleWidth = obstacleWidth;
    (obstacle as any).obstacleHeight = obstacleHeight;

    (obstacle as any).passed = false;

    this.root.addChild(obstacle);
    this.obstacles.push(obstacle);
  }

  private startLoop(): void {
    this.app?.ticker.add(() => {
      this.update();
    });
  }

  private update(): void {
    if (!this.isGameStarted || this.gameOver || this.isPaused) {
      return;
    }


    this.updatePlayer();
    this.animatePlayer();
    this.updateObstacles();
    this.checkObstacleCollisions();
    this.checkObstaclePassed();
    this.spawnObstaclesIfNeeded();
    this.checkLevelProgress();
  }

  private updatePlayer(): void {
    let dx = 0;
    let dy = 0;

    this.velocityY += this.gravity;

    const groundY = this.app!.renderer.height - 100;
    const maxY = groundY - this.playerHeight;
    this.player.y += this.velocityY;

    if (this.player.y >= maxY) {
      this.player.y = maxY;
      this.velocityY = 0;
      this.isOnGround = true;
    } else {
      this.isOnGround = false;
    }



    if ((this.isPressed('w') || this.isPressed('arrowup')) && this.isOnGround) {
      this.velocityY = this.jumpForce;
    }

    this.player.x += dx;
    this.player.y += dy;


    // clamp X (optional but good)
    this.player.x = 120;

    // clamp Y (THIS is your grass limit)
    this.player.y = Math.min(this.player.y, maxY);
  }


  private endGame(): void {
    this.gameOver = true;
    this.messageText.text = `Game Over\nScore: ${this.score}\nPress R to restart`;
  }

  private resetGame(): void {
    this.score = 0;
    this.gameOver = false;
    this.spawnTimer = 0;
    this.velocityY = 0;
    this.isOnGround = true;
    this.currentLevelIndex = 0;

    this.messageText.text = '';

    this.player.x = 120;
    this.player.y =
      this.app!.renderer.height - this.groundHeight - this.playerHeight;

    for (const obstacle of this.obstacles) {
      this.root.removeChild(obstacle);
      obstacle.destroy();
    }

    this.obstacles = [];
    this.isPaused = false;
    this.pauseText.visible = false;
    this.isGameStarted = true;
    this.startText.visible = false;
    this.createObstacle();
    this.updateHud();
  }


  private togglePause(): void {
    this.isPaused = !this.isPaused;
    this.pauseText.visible = this.isPaused;
  }

  private updateHud(): void {
    this.scoreText.text = `Score: ${this.score}`;
    this.levelText.text = `Level: ${this.currentLevel.id}`;
  }


  private isPressed(key: string): boolean {
    return this.pressedKeys.has(key);
  }

  private get currentLevel(): LevelConfig {
    return this.levels[this.currentLevelIndex];
  }

  private checkLevelProgress(): void {
    const nextLevelIndex = this.currentLevelIndex + 1;

    if (nextLevelIndex >= this.levels.length) {
      return;
    }


    if (this.score >= this.currentLevel.scoreToUnlockNext) {
      this.currentLevelIndex = nextLevelIndex;
      this.updateHud();
    }
  }

  private animatePlayer(): void {
    this.runTime += 0.15;

    const legSwing = Math.sin(this.runTime) * 0.6;

    this.leftLeg.rotation = legSwing;
    this.rightLeg.rotation = -legSwing;
  }

  private bindEvents(): void {
    globalThis.addEventListener('keydown', this.onKeyDown);
    globalThis.addEventListener('keyup', this.onKeyUp);
  }
}
