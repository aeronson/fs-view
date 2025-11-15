import { CommonModule } from '@angular/common';
import { Component, signal, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import Chart from 'chart.js/auto';

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
  funscriptData: any = null;
  dirHandle?: FileSystemDirectoryHandle;
  chart?: Chart;

  @ViewChild('videoRef') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('chartRef') chartRef!: ElementRef<HTMLCanvasElement>;

  async selectFolder() {
    try {
      this.dirHandle = await (window as any).showDirectoryPicker();
      if (this.dirHandle) {
        this.selectedFolder = this.dirHandle.name;
        this.files = [];

        for await (const entry of this.dirHandle.values()) {
          if (entry.kind === 'file' && /^\d{4}\.mp4$/i.test(entry.name)) {
            this.files.push(entry);
          }
        }
        this.files.sort((a, b) => this.getFileName(a).localeCompare(this.getFileName(b)));
        if (this.files.length > 0) {
          this.selectedFile = this.getFileName(this.files[0]);
          await this.loadVideo();
        }
      }

    } catch (e) {
      console.error(e);
    }
  }

async loadVideo() {
  if (this.videoSrc) URL.revokeObjectURL(this.videoSrc);
  this.videoSrc = '';
  this.funscriptData = null;
  if (this.chart) this.chart.destroy();
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

    if (this.dirHandle) {
      try {
        const funHandle = await this.dirHandle.getFileHandle(`${this.selectedFile}.funscript`);
        const funFile = await funHandle.getFile();
        const text = await funFile.text();
        this.funscriptData = JSON.parse(text);
        setTimeout(() => {
          if (this.funscriptData && this.chartRef) {
            const actions = this.funscriptData.actions.sort((a: any, b: any) => a.at - b.at);
            const labels = actions.map((a: any) => a.at / 1000);
            const data = actions.map((a: any) => a.pos);
            this.chart = new Chart(this.chartRef.nativeElement, {
              type: 'line',
              data: {
                labels,
                datasets: [{ data, label: 'Funscript', borderColor: 'blue', fill: false }]
              },
              options: {
                scales: {
                  x: { title: { display: true, text: 'Time (s)' } },
                  y: { title: { display: true, text: 'Position' }, min: 0, max: 100 }
                }
              }
            });
          }
        }, 0);
      } catch (e) {
        console.error('Failed to load funscript:', e);
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