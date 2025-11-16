import { CommonModule } from '@angular/common';
import { Component, signal, ViewChild, ElementRef, ChangeDetectorRef, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import Chart from 'chart.js/auto';
import annotationPlugin from 'chartjs-plugin-annotation';

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
  selectedIndex = -1;
  isPlaying = false;
  funscriptData: any = null;
  dirHandle?: FileSystemDirectoryHandle;
  chart?: Chart;
  videoDuration: number = 0;
  currentTime: number = 0;
  private animationFrameId: number | null = null;

  @ViewChild('videoRef') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('chartRef') chartRef!: ElementRef<HTMLCanvasElement>;

  constructor(private cdr: ChangeDetectorRef) {
    Chart.register(annotationPlugin);
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === ' ') {
      event.preventDefault();
      if (this.isPlaying) {
        this.pause();
      } else {
        this.play();
      }
    }
  }

  async selectFolder() {
    try {
      this.dirHandle = await (window as any).showDirectoryPicker();
      if (this.dirHandle) {
        this.selectedFolder = this.dirHandle.name;
        let tempFiles: any[] = [];

        for await (const entry of this.dirHandle.values()) {
          if (entry.kind === 'file' && /^\d{4}\.mp4$/i.test(entry.name)) {
            tempFiles.push(entry);
          }
        }
        tempFiles.sort((a, b) => this.getFileName(a).localeCompare(this.getFileName(b)));

        this.files = [];
        for (let i = 0; i < tempFiles.length; i++) {
          this.files.push(tempFiles[i]);
          if (i < tempFiles.length - 1) {
            const currentNum = parseInt(this.getFileName(tempFiles[i]), 10);
            const nextNum = parseInt(this.getFileName(tempFiles[i + 1]), 10);
            const gap = nextNum - currentNum - 1;
            for (let j = 0; j < gap; j++) {
              this.files.push(tempFiles[i]);
            }
          }
        }

        if (this.files.length > 0) {
          this.selectedIndex = 0;
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
    this.videoDuration = 0;
    this.currentTime = 0;
    if (this.selectedIndex < 0) return;
    const selected = this.files[this.selectedIndex];
    this.selectedFile = this.getFileName(selected);
    const file = await selected.getFile();
    this.videoSrc = URL.createObjectURL(file);

    if (this.dirHandle) {
      try {
        const funHandle = await this.dirHandle.getFileHandle(`${this.selectedFile}.funscript`);
        const funFile = await funHandle.getFile();
        const text = await funFile.text();
        this.funscriptData = JSON.parse(text);
        this.cdr.detectChanges();
        setTimeout(() => {
          if (this.funscriptData && this.chartRef) {
            const actions = this.funscriptData.actions.sort((a: any, b: any) => a.at - b.at);
            const dataPoints = actions.map((a: any) => ({ x: a.at / 1000, y: a.pos }));
            this.chart = new Chart(this.chartRef.nativeElement, {
              type: 'line',
              data: {
                datasets: [{
                  data: dataPoints,
                  label: 'Funscript',
                  borderColor: 'blue',
                  fill: false
                }]
              },
              options: {
                scales: {
                  x: {
                    type: 'linear',
                    title: { display: true, text: 'Time (s)' }
                  },
                  y: {
                    title: { display: true, text: 'Position' },
                    min: 0,
                    max: 100
                  }
                },
                plugins: {
                  annotation: {
                    annotations: {
                      progressLine: {
                        type: 'line',
                        scaleID: 'x',
                        yScaleID: 'y',
                        yMin: 0,
                        yMax: 100,
                        value: 0,
                        borderColor: 'red',
                        borderWidth: 2
                      }
                    }
                  }
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

  onLoadedMetadata() {
    this.videoDuration = this.videoRef.nativeElement.duration;
    this.cdr.detectChanges();
  }

  updateProgressLine(time: number) {
    if (this.chart) {
      const plugins = this.chart.options.plugins as any;
      if (plugins && plugins.annotation && plugins.annotation.annotations) {
        plugins.annotation.annotations.progressLine.value = time;
      }
      this.chart.update('none');
    }
  }

  startAnimationLoop() {
    const animate = () => {
      if (this.isPlaying && this.videoRef) {
        this.currentTime = this.videoRef.nativeElement.currentTime;
        this.updateProgressLine(this.currentTime);
        this.animationFrameId = requestAnimationFrame(animate);
      }
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  stopAnimationLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  seekVideo() {
    if (this.videoRef) {
      this.videoRef.nativeElement.currentTime = this.currentTime;
      this.updateProgressLine(this.currentTime);
    }
  }

  onLoadedData() {
    if (this.isPlaying) {
      this.play();
    } else {
      this.currentTime = 0;
      this.updateProgressLine(0);
    }
  }

  autoNext() {
    this.next();
  }

  async previous() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      await this.loadVideo();
    }
  }

  async next() {
    if (this.selectedIndex < this.files.length - 1) {
      this.selectedIndex++;
      await this.loadVideo();
    }
  }

  restart() {
    if (this.videoRef) {
      this.videoRef.nativeElement.currentTime = 0;
      this.currentTime = 0;
      this.updateProgressLine(0);
    }
  }

  play() {
    if (this.videoRef) {
      this.isPlaying = true;
      this.videoRef.nativeElement.play();
      this.startAnimationLoop();
    }
  }

  pause() {
    if (this.videoRef) {
      this.isPlaying = false;
      this.videoRef.nativeElement.pause();
      this.stopAnimationLoop();
      this.currentTime = this.videoRef.nativeElement.currentTime;
      this.updateProgressLine(this.currentTime);
    }
  }

  toggleFullscreen() {
  const elem = document.getElementById('video-block');
  if (elem) {
    if (!document.fullscreenElement) {
      elem.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }
}

  getFileName(entry: any) {
    return entry?.name?.replace(/\.mp4$/i, '') ?? '';
  }
}