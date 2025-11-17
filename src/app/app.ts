import { CommonModule } from '@angular/common';
import { Component, signal, ViewChild, ElementRef, ChangeDetectorRef, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Chart from 'chart.js/auto';
import annotationPlugin from 'chartjs-plugin-annotation';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  // Background image data URL captured from first video's first frame
  backgroundDataUrl: string | null = null;
  private animationFrameId: number | null = null;
  private nextVideoCache?: { file: File; funscriptData: any };
  // Map of preloaded object URLs by file index
  preloadedUrls: Map<number, string> = new Map();

  @ViewChild('videoRef') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('chartRef') chartRef!: ElementRef<HTMLCanvasElement>;

  constructor(private cdr: ChangeDetectorRef) {
    Chart.register(annotationPlugin);
  }

  // Preload object URLs for all files (non-blocking, runs in background)
  async preloadAllVideos() {
    if (!this.dirHandle || !this.files || this.files.length === 0) return;
    // Don't double-preload
    if (this.preloadedUrls.size > 0) return;

    const promises: Promise<void>[] = [];
    for (let i = 0; i < this.files.length; i++) {
      const entry = this.files[i];
      const p = (async () => {
        try {
          const file = await entry.getFile();
          const url = URL.createObjectURL(file);
          this.preloadedUrls.set(i, url);
          // Minor debug hint
          try { this.cdr.detectChanges(); } catch {}
        } catch (e) {
          console.error('Failed to preload file index', i, e);
        }
      })();
      promises.push(p);
    }

    await Promise.all(promises);
    console.log('Preloaded', this.preloadedUrls.size, 'videos');
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

  @HostListener('document:keydown', ['$event'])
  handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && document.fullscreenElement) {
      document.exitFullscreen();
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
          // Start preloading all videos in the background
          this.preloadAllVideos().catch(err => console.error('Preload all error:', err));
        }
      }

    } catch (e) {
      console.error(e);
    }
  }

  async loadVideo() {
    this.funscriptData = null;
    if (this.chart) this.chart.destroy();
    this.videoDuration = 0;
    this.currentTime = 0;
    if (this.selectedIndex < 0) return;
    const selected = this.files[this.selectedIndex];
    this.selectedFile = this.getFileName(selected);

    // Use cached next video if available, otherwise fetch fresh
    let videoFile: File | undefined;
    let funscriptData: any = null;

    if (this.nextVideoCache) {
      videoFile = this.nextVideoCache.file;
      funscriptData = this.nextVideoCache.funscriptData;
      this.nextVideoCache = undefined; // Clear cache after using
    } else {
      videoFile = await selected.getFile();

      if (this.dirHandle) {
        try {
          const funHandle = await this.dirHandle.getFileHandle(`${this.selectedFile}.funscript`);
          const funFile = await funHandle.getFile();
          const text = await funFile.text();
          funscriptData = JSON.parse(text);
        } catch (e) {
          // Funscript not found, continue without it
        }
      }
    }

    // Prefer a preloaded URL if available
    const preloaded = this.preloadedUrls.get(this.selectedIndex);
    if (this.videoSrc && !this.preloadedUrls.has(this.selectedIndex)) {
      // Only revoke the old object URL if it's not one of the preloaded persistent URLs
      try { URL.revokeObjectURL(this.videoSrc); } catch {}
    }

    if (preloaded) {
      this.videoSrc = preloaded;
    } else if (videoFile) {
      this.videoSrc = URL.createObjectURL(videoFile);
    }
    this.funscriptData = funscriptData;

    if (this.funscriptData) {
      this.cdr.detectChanges();
      setTimeout(() => {
        this.createChart();
      }, 50);
    }
  }

  onLoadedMetadata() {
    this.videoDuration = this.videoRef.nativeElement.duration;
    this.cdr.detectChanges();
  }

  updateProgressLine(time: number) {
    if (this.chart) {
      try {
        const options = this.chart.options as any;
        if (options?.plugins?.annotation?.annotations?.progressLine) {
          options.plugins.annotation.annotations.progressLine.value = time;
          this.chart.update('none');
        }
      } catch (e) {
        console.error('Error updating progress line:', e);
      }
    }
  }

  private createChart() {
    if (!this.funscriptData || !this.chartRef?.nativeElement) {
      return;
    }

    try {
      const actions = this.funscriptData.actions.sort((a: any, b: any) => a.at - b.at);
      const dataPoints = actions.map((a: any) => ({ x: a.at / 1000, y: a.pos }));
      
      // Calculate max time for x-axis
      const maxTime = dataPoints.length > 0 ? Math.max(...dataPoints.map((p: any) => p.x)) : 100;
      
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
              display: false,
              min: 0,
              max: maxTime
            },
            y: {
              display: false,
              min: 0,
              max: 100
            }
          },
          plugins: {
            legend: {
              display: false
            },
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
        } as any
      });
    } catch (error) {
      console.error('Failed to create chart:', error);
    }
  }

  startAnimationLoop() {
    const animate = () => {
      if (this.isPlaying && this.videoRef) {
        this.currentTime = this.videoRef.nativeElement.currentTime;
        this.updateProgressLine(this.currentTime);
        this.cdr.markForCheck();
        this.animationFrameId = requestAnimationFrame(animate);
      }
    };
    this.animationFrameId = requestAnimationFrame(animate);
    // Preload next video when starting playback
    this.preloadNextVideo();
  }

  stopAnimationLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private async preloadNextVideo() {
    // Don't preload if we're at the last video
    if (this.selectedIndex >= this.files.length - 1 || !this.dirHandle) {
      return;
    }

    try {
      const nextIndex = this.selectedIndex + 1;
      const nextFileEntry = this.files[nextIndex];
      const nextFile = await nextFileEntry.getFile();
      
      let nextFunscriptData = null;
      try {
        const funHandle = await this.dirHandle.getFileHandle(`${this.getFileName(nextFileEntry)}.funscript`);
        const funFile = await funHandle.getFile();
        const text = await funFile.text();
        nextFunscriptData = JSON.parse(text);
      } catch (e) {
        // Funscript not found or parsing failed, continue without it
      }

      this.nextVideoCache = {
        file: nextFile,
        funscriptData: nextFunscriptData
      };

      // If we preloaded all videos, prefer using preloaded URL for the inactive element
      const preloaded = this.preloadedUrls.get(nextIndex);
      try {
        if (preloaded) {
          // Do not overwrite the active src — we only want to ensure the next file is available in the preloaded map
          console.log('Next video preloaded (url available)');
        }
      } catch (e) {
        // ignore
      }
    } catch (e) {
      console.error('Failed to preload next video:', e);
      this.nextVideoCache = undefined;
    }
  }

  seekVideo() {
    if (this.videoRef) {
      this.videoRef.nativeElement.currentTime = this.currentTime;
      this.updateProgressLine(this.currentTime);
    }
  }

  onLoadedData() {
    if (!this.backgroundDataUrl && this.selectedIndex === 0) {
      // Capture the first visible frame of the first video to use as a background behind the player
      this.captureFirstFrame().catch(e => console.error('captureFirstFrame failed', e));
    }

    if (this.isPlaying) {
      this.play();
    } else {
      this.currentTime = 0;
      this.updateProgressLine(0);
    }
  }

  private async captureFirstFrame() {
    try {
      const video = this.videoRef?.nativeElement;
      if (!video) return;
      // Ensure there's at least one frame
      if (video.readyState < 2) {
        await new Promise<void>(resolve => {
          const onCan = () => {
            video.removeEventListener('canplay', onCan);
            resolve();
          };
          video.addEventListener('canplay', onCan);
          setTimeout(() => { video.removeEventListener('canplay', onCan); resolve(); }, 2000);
        });
      }

      const w = video.videoWidth || video.clientWidth || 600;
      const h = video.videoHeight || video.clientHeight || 400;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      this.backgroundDataUrl = canvas.toDataURL('image/png');
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Error capturing frame:', e);
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
    const elem = this.videoRef?.nativeElement;
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

  // Cleanup preloaded object URLs when component is destroyed
  ngOnDestroy() {
    try {
      if (this.videoSrc && !Array.from(this.preloadedUrls.values()).includes(this.videoSrc)) {
        URL.revokeObjectURL(this.videoSrc);
      }
    } catch (e) {}
    for (const url of this.preloadedUrls.values()) {
      try { URL.revokeObjectURL(url); } catch (e) {}
    }
  }
}