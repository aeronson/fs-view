import { CommonModule } from '@angular/common';
import { Component, ElementRef, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App {
  protected readonly title = signal('fs-view');

  files: any[] = [];
  selectedFolder: string = '';
  selectedFile = '';
  videoSrc = '';
  currentIndex = -1;

  @ViewChild('videoRef') videoRef!: ElementRef<HTMLVideoElement>;

  async selectFolder() {
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      this.selectedFolder = dirHandle.name;
      this.files = [];

      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.mp4')) {
          this.files.push(entry);
        }
      }
      this.files.sort((a, b) => this.getFileName(a).localeCompare(this.getFileName(b)));
    } catch (e) {
      console.error(e);
    }
  }

  async loadVideo() {
    if (this.videoSrc) URL.revokeObjectURL(this.videoSrc);
    this.videoSrc = '';
    if (!this.selectedFile) return;
    const selected = this.files.find(f => this.getFileName(f) === this.selectedFile);
    if (selected) {
      const file = await selected.getFile();
      this.videoSrc = URL.createObjectURL(file);
    }
  }

  async previous() {
    if (this.currentIndex > 0) {
      const newIndex = this.currentIndex - 1;
      this.selectedFile = this.getFileName(this.files[newIndex]);
      await this.loadVideo();
    }
  }

  async next() {
    if (this.currentIndex < this.files.length - 1) {
      const newIndex = this.currentIndex + 1;
      this.selectedFile = this.getFileName(this.files[newIndex]);
      await this.loadVideo();
    }
  }

  restart() {
    if (this.videoRef) {
      this.videoRef.nativeElement.currentTime = 0;
    }
  }
  play() {
    if (this.videoRef) {
      this.videoRef.nativeElement.play();
    }
  }

  pause() {
    if (this.videoRef) {
      this.videoRef.nativeElement.pause();
    }
  }

  getFileName(entry: any) {
    return entry?.name?.replace(/\.mp4$/i, '') ?? '';
  }
}