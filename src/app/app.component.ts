import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PixiCanvasComponent } from './pixi-canvas/pixi-canvas.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, PixiCanvasComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Angular Pixi App';
}
