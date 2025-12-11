import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlayerComponent } from './features/player/player.component';
import { ProfileComponent as ProfileComponent } from './features/profile/profile';
import { MergeVideo } from './features/merge-video/merge-video';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, PlayerComponent, ProfileComponent, MergeVideo],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App {
  protected readonly title = signal('fs-view');
}