import { CommonModule } from '@angular/common';
import { Component, signal, ViewChild, ElementRef } from '@angular/core';
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
  isPlaying = false;
  repeatCount = 0;

  @ViewChild('videoRef') videoRef!: ElementRef<HTMLVideoElement>;

  async selectFolder() {
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      this.selectedFolder = dirHandle.name;
      this.files = [];

      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && /^\d{4}\.mp4$/i.test(entry.name)) {
          this.files.push(entry);
        }
      }
      this.files.sort((a, b) => this.getFileName(a).localeCompare(this.getFileName(b)));
      if (this.files.length > 0) {
        this.selectedFile = this.getFileName(this.files[0]);
        await this.loadVideo();
      }
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
      this.currentIndex = this.files.indexOf(selected);
      const file = await selected.getFile();
      this.videoSrc = URL.createObjectURL(file);

      this.repeatCount = 1;
      if (this.currentIndex < this.files.length - 1) {
        const currentNum = parseInt(this.selectedFile, 10);
        const nextNum = parseInt(this.getFileName(this.files[this.currentIndex + 1]), 10);
        const gap = nextNum - currentNum - 1;
        if (gap > 0) {
          this.repeatCount = gap + 1;
        }
      }
    }
  }

  onLoadedData() {
    if (this.isPlaying) {
      this.play();
    }
  }

  autoNext() {
    if (this.repeatCount > 0) {
      this.repeatCount--;
      if (this.repeatCount === 0) {
        this.next();
      } else {
        this.videoRef.nativeElement.currentTime = 0;
        this.videoRef.nativeElement.play();
      }
      return;
    }
    this.next();
  }

  async previous() {
    if (this.currentIndex > 0) {
      this.selectedFile = this.getFileName(this.files[this.currentIndex - 1]);
      await this.loadVideo();
    }
  }

  async next() {
    if (this.currentIndex < this.files.length - 1) {
      this.selectedFile = this.getFileName(this.files[this.currentIndex + 1]);
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
      this.isPlaying = true;
      this.videoRef.nativeElement.play();
    }
  }

  pause() {
    if (this.videoRef) {
      this.isPlaying = false;
      this.videoRef.nativeElement.pause();
    }
  }

  getFileName(entry: any) {
    return entry?.name?.replace(/\.mp4$/i, '') ?? '';
  }
}